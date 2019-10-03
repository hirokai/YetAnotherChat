port module SessionView exposing (addComment, chatRoomView, getMembers, initialChatPageStatus, mkComment, onKeyDownTextArea, removeItem, sendCommentToServer, sendCommentToServerDone, sessionSubscriptions, sessionViewLoading, showAll, showItem, submitComment, updateChatPageStatus)

import Components exposing (..)
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import List.Extra
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


initialChatPageStatus : Bool -> Bool -> ChatPageModel
initialChatPageStatus show_top_pane expand_chatinput =
    { filterMode = Thread, filter = Set.empty, users = [], messages = Nothing, topPaneExpanded = show_top_pane, shrunkEntries = False, fontSize = 3, expandChatInput = expand_chatinput, chatInputActive = True, showVideoDiv = False, videoMembers = Set.empty }


sessionViewLoading : SessionID -> Model -> { title : String, body : List (Html Msg) }
sessionViewLoading sid model =
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10", id "chatroom_body" ]
                    [ topPane model
                    , div [ id "chat-body", classList [ ( "row", True ), ( "input_expanded", model.chatPageStatus.expandChatInput ), ( "toppane_expanded", model.chatPageStatus.topPaneExpanded ), ( "show_toppane", model.localConfig.show_toppane ) ], attribute "data-session_id" sid ]
                        [ div [ class "col-md-12 col-lg-12", id "chat-outer" ]
                            [ text "Loading..."
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }


chatRoomView : SessionInfo -> Model -> { title : String, body : List (Html Msg) }
chatRoomView room model =
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10", id "chatroom_body" ]
                    [ topPane model
                    , div [ id "chat-body", classList [ ( "row", True ), ( "input_expanded", model.chatPageStatus.expandChatInput ), ( "toppane_expanded", model.chatPageStatus.topPaneExpanded ) ], attribute "data-session_id" room.id ]
                        [ div [ class "col-md-12 col-lg-12", id "chat-outer" ]
                            [ roomTitle room model
                            , chatParticipants room model
                            , hr [] []
                            , div [] (chatBody room model)
                            ]
                        ]
                    , footer room model
                    ]
                ]
            ]
        ]
    }


chatParticipants : SessionInfo -> Model -> Html msg
chatParticipants room model =
    let
        ws_name =
            Maybe.withDefault "" <| Maybe.map .name <| Dict.get room.workspace model.workspaces

        non_registered_exists =
            not <| List.all identity <| List.filterMap (Maybe.map .registered << getUserInfo model) room.members
    in
    div [ id "chat-participants" ]
        [ a [ title <| "ワークスペース名: " ++ ws_name, class "clickable", href <| "#/workspaces/" ++ room.workspace ] [ text ws_name ]
        , ul [ id "chat-participants-list" ] <|
            List.map
                (\u ->
                    case getUserInfo model u of
                        Just user ->
                            a [ href <| "#/users/" ++ u ]
                                [ li [ classList [ ( "not-registered", not user.registered ) ] ] <|
                                    [ span [ classList [ ( "online-mark", True ), ( "hidden-animate", not user.online ) ] ] [ text "●" ]
                                    , span [] [ text user.username ]
                                    ]
                                        ++ (if user.registered then
                                                []

                                            else
                                                [ text "("
                                                , a [] [ text <| String.join "," <| List.intersperse "," user.emails ]
                                                , text ")"
                                                ]
                                           )
                                ]

                        Nothing ->
                            li [] [ span [] [ text "(N/A)" ] ]
                )
                room.members
        , if non_registered_exists then
            span [] [ text "\u{3000}※薄字は未登録ユーザー（Emailから自動追加）" ]

          else
            text ""
        ]


roomTitle : SessionInfo -> Model -> Html Msg
roomTitle room model =
    h1 [ id "room-title" ]
        [ if Set.member "room-title" model.editing then
            input
                [ id "room-title-input"
                , value (Maybe.withDefault "(N/A)" <| Dict.get "room-title" model.editingValue)
                , onKeyDown
                    (let
                        nv =
                            Maybe.withDefault "" <| Dict.get "room-title" model.editingValue
                     in
                     EditingKeyDown "room-title" (updateRoomName room.id nv) (sendRoomName { id = room.id, new_name = nv }) False
                    )
                , onInput (UpdateEditingValue "room-title")
                ]
                []

          else
            span [ id "room-title-text" ] [ text room.name ]
        , if room.owner == model.myself then
            div [ id "toolbar-sessionview" ]
                [ if Set.member "room-title" model.editing then
                    let
                        nv =
                            Maybe.withDefault "" <| Dict.get "room-title" model.editingValue
                    in
                    span []
                        [ a [ id "edit-roomname", class "btn btn-sm btn-light", onClick (FinishEditing "room-title" (updateRoomName room.id nv) (sendRoomName { id = room.id, new_name = nv })) ] [ text "確定" ]
                        , a [ id "edit-roomname", class "btn btn-sm btn-light", onClick (AbortEditing "room-title") ] [ text "キャンセル" ]
                        ]

                  else
                    span [] [ a [ id "edit-roomname", class "btn btn-sm btn-light", onClick (StartEditing "room-title" room.name) ] [ text "名前を変更" ] ]
                , a [ id "delete-room", class "btn btn-danger btn-sm", onClick (DeleteRoom room.id) ]
                    [ text "削除" ]
                , select
                    [ on "change" <| Json.map (SetVisibility "session" room.id) targetValue ]
                    [ option [ value "workspace", selected (room.visibility == "workspace") ] [ text "ワークスペース内で公開" ], option [ value "url", selected (room.visibility == "url") ] [ text "URL共有" ], option [ value "private", selected (room.visibility == "private") ] [ text "プライベート（招待のみ）" ] ]
                ]

          else
            text ""
        , a [ id "reload-room", class "btn btn-light", onClick (ReloadRoom room.id) ] [ text "Reload" ]
        , if Set.isEmpty model.chatPageStatus.videoMembers then
            a [ id "start-video", class "btn btn-sm btn-light", onClick (SessionMsg <| StartVideo room.id) ] [ text "ビデオ通話を開始" ]

          else
            a [ id "start-video", class "btn btn-sm btn-primary", onClick (SessionMsg <| StartVideo room.id) ] [ text "ビデオ通話に参加" ]
        ]


chatBody : SessionInfo -> Model -> List (Html Msg)
chatBody room model =
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
                , button [ class "btn-sm btn-light btn", onClick (SessionMsg ScrollToBottom) ] [ text "⬇⬇" ]
                , button [ class "btn-sm btn-light btn", onClick (SessionMsg (SetShrinkEntries (not model.chatPageStatus.shrunkEntries))) ]
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
                , if model.chatPageStatus.showVideoDiv then
                    videoDiv room model

                  else
                    text ""
                ]
            ]

        Nothing ->
            []


videoDiv : SessionInfo -> Model -> Html Msg
videoDiv room model =
    let
        remoteVideoCell uid n =
            div [ class "video-div-cell" ]
                [ span [ class "video-username" ] [ text (getUserNameDisplay model uid) ]
                , br [] []
                , video [ autoplay True, Html.Attributes.attribute "playsinline" "true", id ("remote-video." ++ uid), Html.Attributes.attribute "muted" "true" ] []
                ]

        users =
            List.filter (\u -> u /= model.myself) <| roomUsers room.id model
    in
    div [ id "video-div" ] <|
        [ div [ class "video-div-cell" ]
            [ span [ class "video-username" ] [ text (getUserNameDisplay model model.myself) ]
            , br [] []
            , video [ autoplay True, Html.Attributes.attribute "playsinline" "true", id "my-video", Html.Attributes.attribute "muted" "true" ] []
            ]
        ]
            ++ List.indexedMap (\i u -> remoteVideoCell u i) users
            ++ [ button [ class "btn btn-primary", id "stop-video", onClick (SessionMsg <| StopVideo room.id) ] [ text "終了" ] ]


footer : SessionInfo -> Model -> Html Msg
footer room model =
    div [ classList [ ( "col-lg-10", True ), ( "col-md-7", True ), ( "expanded", model.chatPageStatus.expandChatInput ) ], id "footer_wrapper" ]
        [ div [ class "col-md-12 col-lg-12", id "footer" ]
            [ button [ class "btn btn-light", id "chat-input-expand", onClick (SessionMsg <| ClickExpandInput) ]
                [ i [ class "material-icons" ] [ text "unfold_more" ] ]
            , textarea
                [ id "chat-input"
                , placeholder "Shift+Enterでコメント送信。画像はファイルをドラッグ＆ドロップあるいはクリップボードから貼り付けて投稿。"
                , rows
                    (if model.chatPageStatus.expandChatInput then
                        5

                     else
                        1
                    )
                , onInput (UpdateEditingValue "chat")
                , onKeyDown (onKeyDownTextArea model room.id)
                , disabled (not model.chatPageStatus.chatInputActive)
                , value
                    (Maybe.withDefault "" <| Dict.get "chat" model.editingValue)
                ]
                []
            , button [ class "btn btn-primary btn-sm", id "submit-btn", onClick SubmitComment ] [ text "送信" ]
            ]
        ]


showItem : Model -> ChatEntry -> Html Msg
showItem model entry =
    let
        session =
            case model.page of
                RoomPage s ->
                    s

                _ ->
                    ""
    in
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
                        [ div []
                            [ div [ class "chat_user_icon" ] [ img [ class "chat_user_icon", src (iconOfUser userInfo) ] [] ]
                            , div [ class "chat_user_name", attribute "data-toggle" "tooltip", title <| getUserFullname model m.user ]
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
                                , if m.user == model.myself then
                                    span [ class "remove-item clickable", onClick (SessionMsg (RemoveItem session m.id)) ] [ text "×" ]

                                  else
                                    text ""
                                ]
                            , div [ class "clear" ] []
                            ]
                        , div [ class "chat_comment" ]
                            [ div [ classList [ ( "chat_comment_content", True ), ( "font-" ++ String.fromInt model.chatPageStatus.fontSize, True ) ] ] <| mkComment m.comment
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
                                , span [ class "remove-item clickable", onClick (SessionMsg (RemoveItem session m.id)) ] [ text "×" ]
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
                    True

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


updateChatPageStatus : SessionMsg -> ChatPageModel -> ( ChatPageModel, Cmd msg )
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

        RemoveItem session id ->
            removeItem session id model

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

        StartVideo r ->
            ( { model | showVideoDiv = True }, startVideo r )

        StopVideo r ->
            ( { model | showVideoDiv = False }, stopVideo r )

        VideoJoin u ->
            ( { model | videoMembers = Set.insert u model.videoMembers }, Cmd.none )

        VideoLeft u ->
            ( { model | videoMembers = Set.remove u model.videoMembers }, Cmd.none )


removeItem : String -> String -> ChatPageModel -> ( ChatPageModel, Cmd msg )
removeItem session id model =
    let
        f m =
            getId m /= id
    in
    case model.messages of
        Just msgs ->
            ( { model | messages = Just (List.filter f msgs) }, removeItemRemote { session = session, comment = id } )

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


sessionSubscriptions : List (Sub Msg)
sessionSubscriptions =
    [ videoJoin (SessionMsg << VideoJoin), videoLeft (SessionMsg << VideoLeft) ]
