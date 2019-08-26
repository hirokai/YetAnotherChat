port module SessionView exposing (addComment, chatRoomView, getMembers, initialChatPageStatus, mkComment, onKeyDownTextArea, removeItem, sendCommentToServer, sendCommentToServerDone, showAll, showItem, submitComment, updateChatPageStatus)

import Components exposing (..)
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import List.Extra
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


initialChatPageStatus : Bool -> Bool -> ChatPageModel
initialChatPageStatus show_top_pane expand_chatinput =
    { filterMode = Thread, filter = Set.empty, users = [], messages = Nothing, topPaneExpanded = show_top_pane, shrunkEntries = False, fontSize = 3, expandChatInput = expand_chatinput, chatInputActive = True }


chatRoomView : RoomID -> Model -> { title : String, body : List (Html Msg) }
chatRoomView room model =
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ topPane model
                    , div [ id "chat-body", class "row", attribute "data-session_id" room ]
                        [ div [ class "col-md-12 col-lg-12" ]
                            [ div [ class "col-md-12 col-lg-12", id "chat-outer" ]
                                [ roomTitle room model
                                , div [ id "chat-participants" ]
                                    [ text <| "参加者："
                                    , ul [] <|
                                        List.map
                                            (\u ->
                                                case getUserInfo model u of
                                                    Just user ->
                                                        li []
                                                            [ span [ classList [ ( "online-mark", True ), ( "hidden-animate", not user.online ) ] ] [ text "●" ]
                                                            , a [ onClick (EnterUser u), class "clickable" ] [ text user.username ]
                                                            , text "("
                                                            , a [] [ text <| String.join "," <| List.intersperse "," user.emails ]
                                                            , text ")"
                                                            ]

                                                    Nothing ->
                                                        li [] []
                                            )
                                            (roomUsers room model)
                                    ]
                                , hr [] []
                                , div [] (chatBody model)
                                ]
                            ]
                        ]
                    , footer room model
                    ]
                ]
            ]
        ]
    }


roomTitle : String -> Model -> Html Msg
roomTitle room model =
    h1 []
        [ if Set.member "room-title" model.editing then
            input
                [ value (Maybe.withDefault "(N/A)" <| Dict.get "room-title" model.editingValue)
                , onKeyDown
                    (let
                        nv =
                            Maybe.withDefault "" <| Dict.get "room-title" model.editingValue
                     in
                     EditingKeyDown "room-title" (updateRoomName room nv) (sendRoomName { id = room, new_name = nv })
                    )
                , onInput (UpdateEditingValue "room-title")
                ]
                []

          else
            text <| Maybe.withDefault "(N/A)" (Maybe.map (\a -> a.name) (Dict.get room model.roomInfo))
        , a [ id "edit-roomname", class "clickable", onClick (StartEditing "room-title" (roomName room model)) ] [ text "Edit" ]
        , a [ id "delete-room", class "clickable", onClick (DeleteRoom room) ] [ text "Delete" ]
        , a [ id "reload-room", class "btn btn-light", onClick (ReloadRoom room) ] [ text "Reload" ]
        ]


chatBody : Model -> List (Html Msg)
chatBody model =
    case model.chatPageStatus.messages of
        Just messages ->
            let
                messages_filtered =
                    List.filter (\m -> Set.member (getUser m) model.chatPageStatus.filter) messages

                messages_filtered_nonevent =
                    List.filter (\m -> getKind m /= "event") messages_filtered

                nonevent_count =
                    List.length messages_filtered_nonevent
            in
            [ div [ id "message-count" ]
                [ text
                    (String.fromInt nonevent_count
                        ++ " message"
                        ++ (if nonevent_count > 1 then
                                "s"

                            else
                                ""
                           )
                        ++ "."
                    )
                , button [ class "btn-sm btn-light btn", onClick (ChatPageMsg ScrollToBottom) ] [ text "⬇⬇" ]
                , button [ class "btn-sm btn-light btn", onClick (ChatPageMsg (SetShrinkEntries (not model.chatPageStatus.shrunkEntries))) ]
                    [ text
                        (if model.chatPageStatus.shrunkEntries then
                            "展開する"

                         else
                            "折りたたむ"
                        )
                    ]
                ]
            , div [ id "chat-wrapper" ]
                [ div
                    [ id "chat-entries" ]
                  <|
                    ((if model.chatPageStatus.shrunkEntries then
                        List.concatMap (\a -> [ a, hr [] [] ])

                      else
                        identity
                     )
                     <|
                        List.map
                            (showItem model)
                            messages_filtered
                    )
                        ++ [ hr [] [], div [ id "end-line" ] [ text "（最新のメッセージです）" ] ]
                ]
            ]

        Nothing ->
            []


footer : String -> Model -> Html Msg
footer room model =
    div [ class "row", id "footer_wrapper" ]
        [ div [ class "col-md-12 col-lg-12", id "footer" ]
            [ button [ class "btn btn-light", id "chat-input-expand", onClick (ChatPageMsg <| ClickExpandInput) ]
                [ i [ class "material-icons" ] [ text "unfold_more" ] ]
            , textarea
                [ id "chat-input"
                , rows
                    (if model.chatPageStatus.expandChatInput then
                        5

                     else
                        1
                    )
                , onInput (UpdateEditingValue "chat")
                , onKeyDown (onKeyDownTextArea model room)
                , disabled (not model.chatPageStatus.chatInputActive)
                , value
                    (Maybe.withDefault "" <| Dict.get "chat" model.editingValue)
                ]
                []
            , button [ class "btn btn-primary", onClick SubmitComment ] [ text "送信" ]
            ]
        ]


showItem : Model -> ChatEntry -> Html Msg
showItem model entry =
    case entry of
        Comment m ->
            case getUserInfo model m.user of
                Just userInfo ->
                    div
                        [ class <|
                            "chat_entry_comment"
                                ++ (if model.chatPageStatus.shrunkEntries then
                                        " shrunk"

                                    else
                                        ""
                                   )
                        , id m.id
                        ]
                        [ div [ style "float" "left" ] [ img [ class "chat_user_icon", src (iconOfUser userInfo) ] [] ]
                        , div [ class "chat_comment" ]
                            [ div [ class "chat_user_name", attribute "data-toggle" "tooltip", title <| getUserFullname model m.user ]
                                [ text
                                    (getUserName model m.user
                                        ++ (if m.sentTo /= "" then
                                                " to " ++ getUserName model m.sentTo

                                            else
                                                ""
                                           )
                                    )
                                , if userInfo.online then
                                    span [ class "online-mark" ] [ text "●" ]

                                  else
                                    text ""
                                , span [ class "chat_timestamp" ] [ text m.formattedTime ]
                                , a [ href (makeLinkToOriginal m) ] [ showSource m.source ]
                                , span [ style "margin-left" "10px" ] [ text m.id ]
                                , if m.user == model.myself then
                                    span [ class "remove-item clickable", onClick (ChatPageMsg (RemoveItem m.id)) ] [ text "×" ]

                                  else
                                    text ""
                                ]
                            , div [ classList [ ( "chat_comment_content", True ), ( "font-" ++ String.fromInt model.chatPageStatus.fontSize, True ) ] ] <| mkComment m.comment
                            ]
                        , div [ style "clear" "both" ] [ text "" ]
                        ]

                Nothing ->
                    div [] [ text "User info not found" ]

        ChatFile m ->
            case getUserInfo model m.user of
                Just userInfo ->
                    div
                        [ classList [ ( "chat_entry_comment", True ), ( "shrunk", model.chatPageStatus.shrunkEntries ) ]
                        , id m.id
                        ]
                        [ div [ style "float" "left" ] [ img [ class "chat_user_icon", src (iconOfUser userInfo) ] [] ]
                        , div [ class "chat_comment" ]
                            [ div [ class "chat_user_name", attribute "data-toggle" "tooltip", title <| getUserFullname model m.user ]
                                [ text <| getUserName model m.user
                                , if userInfo.online then
                                    span [ class "online-mark" ] [ text "●" ]

                                  else
                                    text ""
                                , span [ class "chat_timestamp" ] [ text m.formattedTime ]
                                , a [ href m.url ] [ text "self" ]
                                , span [ style "margin-left" "10px" ] [ text m.id ]
                                , span [ class "remove-item clickable", onClick (ChatPageMsg (RemoveItem m.id)) ] [ text "×" ]
                                ]
                            , div [ class "file-image-chat" ]
                                [ img
                                    [ src
                                        (if m.thumbnailBase64 /= "" then
                                            m.thumbnailBase64

                                         else
                                            m.url
                                        )
                                    ]
                                    []
                                ]
                            , div [ style "clear" "both" ] [ text "" ]
                            ]
                        ]

                Nothing ->
                    div [] [ text "User info not found" ]

        SessionEvent e ->
            div [ class "chat_entry_event", id e.id ] [ hr [] [], text <| getUserName model e.user ++ "が参加しました（" ++ e.timestamp ++ "）", hr [] [] ]


onKeyDownTextArea : Model -> String -> ({ code : Int, shiftKey : Bool } -> Msg)
onKeyDownTextArea model room =
    case Dict.get "chat" model.editingValue of
        Just c ->
            if c /= "" then
                EditingKeyDown "chat"
                    (addComment c)
                    (sendCommentToServer
                        { comment = c, user = model.myself, session = room }
                    )

            else
                \_ -> NoOp

        Nothing ->
            \_ -> NoOp


submitComment : Model -> ( Model, Cmd Msg )
submitComment model =
    case ( Dict.get "chat" model.editingValue, getRoomID model ) of
        ( Just comment, Just room ) ->
            ( addComment comment model, Cmd.batch [ scrollTo "__latest", sendCommentToServer { comment = comment, user = model.myself, session = room } ] )

        _ ->
            ( model, Cmd.none )


addComment : String -> Model -> Model
addComment comment model =
    if comment /= "" then
        case model.chatPageStatus.messages of
            Just _ ->
                let
                    chatPageStatus =
                        model.chatPageStatus

                    new_ev =
                        Dict.insert "chat" "" model.editingValue
                in
                { model | chatPageStatus = { chatPageStatus | chatInputActive = False }, editingValue = new_ev }

            Nothing ->
                model

    else
        model


port sendCommentToServer : { user : String, comment : String, session : String } -> Cmd msg


port sendCommentToServerDone : (() -> msg) -> Sub msg


updateChatPageStatus : ChatPageMsg -> ChatPageModel -> ( ChatPageModel, Cmd msg )
updateChatPageStatus msg model =
    case msg of
        SetFilterMode mode ->
            ( { model | filterMode = mode }, Cmd.none )

        SetFilter item enabled ->
            ( { model
                | filter =
                    if enabled then
                        Set.insert item model.filter

                    else
                        Set.remove item model.filter
              }
            , Cmd.none
            )

        ScrollToBottom ->
            ( model, scrollToBottom () )

        FeedMessages ms ->
            let
                users =
                    getMembers ms
            in
            ( { model | messages = Just ms, users = users, filter = Set.fromList users }, Cmd.none )

        RemoveItem id ->
            removeItem id model

        ExpandTopPane b ->
            ( { model | topPaneExpanded = b }, recalcElementPositions { show_toppane = b, expand_chatinput = model.expandChatInput } )

        SetShrinkEntries b ->
            ( { model | shrunkEntries = b }, Cmd.none )

        SmallerFont ->
            ( { model | fontSize = Basics.max 1 (model.fontSize - 1) }, Cmd.none )

        LargerFont ->
            ( { model | fontSize = Basics.min 5 (model.fontSize + 1) }, Cmd.none )

        ClickExpandInput ->
            let
                new_v =
                    not model.expandChatInput
            in
            ( { model
                | expandChatInput = new_v
              }
            , recalcElementPositions { show_toppane = model.topPaneExpanded, expand_chatinput = new_v }
            )


removeItem : String -> ChatPageModel -> ( ChatPageModel, Cmd msg )
removeItem id model =
    let
        f m =
            getId m /= id
    in
    case model.messages of
        Just msgs ->
            ( { model | messages = Just (List.filter f msgs) }, removeItemRemote id )

        Nothing ->
            ( model, Cmd.none )


mkComment : String -> List (Html.Html msg)
mkComment s =
    let
        mre =
            fromString "http(s)?://([\\w-]+\\.)+[\\w-]+(/[\\w- ./?#\\$%&=]*)?"

        f s1 =
            if s1 == "\n" then
                [ br [] [] ]

            else
                case mre of
                    Just re ->
                        let
                            plains =
                                Regex.split re s1

                            urls =
                                List.map (\m -> m.match) <| Regex.find re s1
                        in
                        List.concatMap (\( p, u ) -> [ text p, a [ href u ] [ text u ] ]) <| List.Extra.zip plains (urls ++ [ "" ])

                    Nothing ->
                        [ text s1 ]
    in
    List.concatMap f <| List.intersperse "\n" <| String.split "\n" s


getMembers : List ChatEntry -> List String
getMembers entries =
    let
        f c =
            case c of
                Comment { user } ->
                    user

                ChatFile { user } ->
                    user

                SessionEvent { user } ->
                    user
    in
    List.Extra.unique <| List.map f entries


showAll : List ChatEntry -> Dict String Bool
showAll messages =
    Dict.fromList <| List.map (\m -> ( m, True )) (getMembers messages)
