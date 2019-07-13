port module Main exposing (ChatEntry(..), Flags, Member, Model, Msg(..), addComment, feedMessages, getMembers, getMessages, iconOfUser, init, initialMessages, isSelected, main, mkComment, onKeyDown, scrollToBottom, showAll, showItem, subscriptions, update, view)

import Browser
import Dict exposing (..)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import List.Extra
import Maybe.Extra
import Set
import Task


type alias CommentTyp =
    { user : String, comment : String, timestamp : String, originalUrl : String, sentTo : String }


port getMessages : RoomID -> Cmd msg


port getRoomInfo : () -> Cmd msg


port getSessionsWithSameMembers : List String -> Cmd msg


port feedSessionsWithSameMembers : (List String -> msg) -> Sub msg


port scrollToBottom : () -> Cmd msg


port createNewSession : ( String, List Member ) -> Cmd msg


port feedMessages : (List CommentTyp -> msg) -> Sub msg


port feedRoomInfo : (List ( RoomID, RoomInfo ) -> msg) -> Sub msg


port receiveNewRoomInfo : ({ name : String, id : RoomID, timestamp : Int } -> msg) -> Sub msg


port sendCommentToServer : { user : String, comment : String, session : String } -> Cmd msg


type ChatEntry
    = Comment CommentTyp
    | ChatFile { user : String, filename : String }


type alias Member =
    String


type alias RoomID =
    String


type alias RoomInfo =
    { id : String, name : String, timestamp : Int, members : List Member }


type Mode
    = NewSession
    | ChatRoom
    | BrowseHistory


getUser : ChatEntry -> String
getUser c =
    case c of
        Comment { user } ->
            user

        ChatFile { user } ->
            user


type alias NewSessionStatus =
    { selected : Set.Set Member, sessions_same_members : List RoomID }


type alias Model =
    { messages : List ChatEntry
    , onlineUsers : List Member
    , chatInput : String
    , myself : Member
    , chatTimestamp : String
    , selected : Dict Member Bool
    , room : RoomID
    , roomInfo : Dict RoomID RoomInfo
    , rooms : List RoomID
    , mode : Mode
    , users : List Member
    , newSessionStatus : NewSessionStatus
    }


init : Flags -> ( Model, Cmd Msg )
init _ =
    ( { messages = initialMessages
      , chatInput = ""
      , chatTimestamp = ""
      , selected = showAll initialMessages
      , onlineUsers = []
      , myself = "Tanaka"
      , room = "Home"
      , roomInfo = Dict.empty
      , rooms = [ "Home", "COI" ]
      , mode = NewSession
      , users = [ "Tanaka", "Yoshida", "Saito", "Kimura", "Abe" ]
      , newSessionStatus = { selected = Set.empty, sessions_same_members = [] }
      }
    , Cmd.batch [ getRoomInfo () ]
    )


people : Model -> List String
people model =
    List.Extra.unique <| List.map getUser model.messages


main : Program Flags Model Msg
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type Msg
    = Msg1
    | Msg2
    | InputComment String
    | SubmitComment
    | CommentBoxKeyDown Int
    | ToggleMember Member
    | FeedMessages (List CommentTyp)
    | EnterRoom RoomID
    | NewSessionMsg NewSessionMsg
    | StartSession (Set.Set Member)
    | ReceiveNewSessionId { timestamp : Int, name : String, id : RoomID }
    | FeedRoomInfo (List ( RoomID, RoomInfo ))
    | EnterNewSessionScreen


type NewSessionMsg
    = TogglePersonInNew Member
    | FeedSessionsWithSameMembers (List String)


onKeyDown : (Int -> msg) -> Attribute msg
onKeyDown tagger =
    on "keydown" (Json.map tagger keyCode)


addComment model =
    { model | messages = List.append model.messages [ Comment { user = model.myself, comment = model.chatInput, timestamp = model.chatTimestamp, originalUrl = "", sentTo = "all" } ], chatInput = "" }


messageFilter : RoomID -> List ChatEntry -> List ChatEntry
messageFilter room msgs =
    let
        f m =
            if room == "Home" then
                True

            else if room == "COI" then
                Maybe.Extra.isJust <| List.Extra.elemIndex (getUser m) [ "matsubara", "yoshida" ]

            else
                getUser m == room
    in
    List.filter f msgs


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Msg1 ->
            ( model, Cmd.none )

        Msg2 ->
            ( model, Cmd.none )

        InputComment s ->
            ( { model | chatInput = s }, Cmd.none )

        SubmitComment ->
            ( addComment model, Cmd.batch [ scrollToBottom (), sendCommentToServer { comment = model.chatInput, user = model.myself, session = model.room } ] )

        CommentBoxKeyDown code ->
            if code == 13 then
                ( addComment model, Cmd.batch [ scrollToBottom (), sendCommentToServer { comment = model.chatInput, user = model.myself, session = model.room } ] )

            else
                ( model, Cmd.none )

        ToggleMember m ->
            let
                v =
                    not (Dict.get m model.selected == Just True)
            in
            ( { model | selected = Dict.insert m v model.selected }, Cmd.none )

        FeedRoomInfo rs ->
            ( { model | roomInfo = Dict.fromList rs, rooms = List.map Tuple.first rs }, Cmd.none )

        FeedMessages ms ->
            let
                f { user, comment, timestamp, originalUrl, sentTo } =
                    Comment { user = user, comment = comment, timestamp = timestamp, originalUrl = originalUrl, sentTo = sentTo }

                msgs =
                    List.map f ms
            in
            ( { model | messages = msgs, selected = showAll msgs }, Cmd.none )

        EnterRoom r ->
            ( { model | room = r, mode = ChatRoom }, getMessages r )

        NewSessionMsg msg1 ->
            let
                ( m, c ) =
                    updateNewSessionStatus msg1 model.newSessionStatus
            in
            ( { model | newSessionStatus = m }, c )

        StartSession users ->
            let
                user_list =
                    Set.toList users
            in
            ( { model | mode = ChatRoom }, createNewSession ( "", user_list ) )

        ReceiveNewSessionId { name, timestamp, id } ->
            ( { model | room = id, roomInfo = Dict.insert id { id = id, name = name, timestamp = timestamp, members = [] } model.roomInfo }, Cmd.none )

        EnterNewSessionScreen ->
            let
                st =
                    model.newSessionStatus
            in
            ( { model | mode = NewSession, newSessionStatus = { st | selected = Set.empty } }, Cmd.none )


toggleSet : comparable -> Set.Set comparable -> Set.Set comparable
toggleSet a xs =
    if Set.member a xs then
        Set.remove a xs

    else
        Set.insert a xs


updateNewSessionStatus : NewSessionMsg -> NewSessionStatus -> ( NewSessionStatus, Cmd msg )
updateNewSessionStatus msg model =
    case msg of
        TogglePersonInNew user ->
            let
                newSelected =
                    toggleSet user model.selected
            in
            ( { model | selected = newSelected }, getSessionsWithSameMembers (Set.toList newSelected) )

        FeedSessionsWithSameMembers ss ->
            ( { model | sessions_same_members = ss }, Cmd.none )


mkComment : String -> List (Html.Html msg)
mkComment s =
    let
        f s1 =
            if s1 == "\n" then
                br [] []

            else
                text s1
    in
    List.map f <| List.intersperse "\n" <| String.split "\n" s


iconOfUser name =
    case name of
        "myself" ->
            "img/myself_icon.jpg"

        otherwise ->
            "img/user_icon.png"


showItem model e =
    case e of
        Comment m ->
            div [ class "chat_entry_comment" ]
                [ div [ style "float" "left" ] [ img [ class "chat_user_icon", src (iconOfUser m.user) ] [] ]
                , div [ class "chat_comment" ]
                    [ div [ class "chat_user_name" ]
                        [ text
                            (m.user
                                ++ (if m.sentTo /= "" then
                                        " to " ++ m.sentTo

                                    else
                                        ""
                                   )
                            )
                        , span [ class "chat_timestamp" ]
                            [ text m.timestamp
                            ]
                        , a [ href m.originalUrl ] [ text "Gmail" ]
                        ]
                    , div [ class "chat_comment_content" ] <| mkComment m.comment
                    ]
                , div [ style "clear" "both" ] [ text "" ]
                ]

        ChatFile f ->
            if isSelected model f.user then
                div [ style "border" "1px solid red", style "padding" "10px", style "width" "500px", style "margin" "5px" ] [ text f.filename ]

            else
                text ""


isSelected : Model -> Member -> Bool
isSelected model m =
    Dict.get m model.selected == Just True


leftMenu : Model -> Html Msg
leftMenu model =
    div [ class "col-md-2 col-lg-2", id "menu-left" ]
        [ div [ id "username-top" ]
            [ text model.myself ]
        , p [] [ text "チャンネル" ]
        , ul [ class "menu-list", id "room-memberlist" ] <|
            List.map (\u -> li [] [ text u ]) (roomUsers model)
        , ul [ class "menu-list" ] <|
            List.map (\r -> li [] [ a [ onClick (EnterRoom r) ] [ text (roomName r model) ] ]) model.rooms
        ]


roomUsers model =
    Maybe.withDefault [] <| Maybe.map (\a -> a.members) <| Dict.get model.room model.roomInfo


leftMenuChat : Model -> Html Msg
leftMenuChat model =
    div [ class "col-md-2 col-lg-2", id "menu-left" ]
        [ div [ id "username-top" ]
            [ text model.myself ]
        , div []
            [ a [ class "btn btn-light", id "newroom-button", onClick EnterNewSessionScreen ] [ text "新しい会話" ]
            ]
        , p [] [ text "チャンネル" ]
        , ul [ class "menu-list", id "room-memberlist" ] <|
            List.map (\u -> li [] [ text u ]) (roomUsers model)
        , ul [ class "menu-list" ] <|
            List.map (\r -> li [] [ a [ onClick (EnterRoom r) ] [ text (roomName r model) ] ]) model.rooms
        ]


roomName id model =
    Maybe.withDefault "" <| Maybe.map .name (Dict.get id model.roomInfo)


view : Model -> Browser.Document Msg
view model =
    case model.mode of
        NewSession ->
            newSessionView model

        ChatRoom ->
            chatRoomView model

        BrowseHistory ->
            historyView model


mkPeoplePanel selected user =
    div
        [ class <|
            "person-panel"
                ++ (if Set.member user selected then
                        " active"

                    else
                        ""
                   )
        , onClick (NewSessionMsg (TogglePersonInNew user))
        ]
        [ h3 [ class "name" ] [ text user ] ]


newSessionView model =
    { title = "Slack clone"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "col-md-10 col-lg-10" ]
                    [ h1 [] [ text "新しい会話を開始" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (mkPeoplePanel model.newSessionStatus.selected)
                            model.users
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (StartSession model.newSessionStatus.selected) ] [ text "開始" ] ]
                    , ul [] (List.map (\s -> li [] [ text (roomName s model) ]) model.newSessionStatus.sessions_same_members)
                    ]
                ]
            ]
        ]
    }


chatRoomView : Model -> { title : String, body : List (Html Msg) }
chatRoomView model =
    { title = "Slack clone"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ leftMenuChat model
                , div [ class "col-md-10 col-lg-10" ]
                    [ h1 [] [ text <| Maybe.withDefault "(N/A)" (Maybe.map (\a -> a.name) (Dict.get model.room model.roomInfo)) ]
                    , div [] [ text <| "参加者：" ++ String.join ", " (roomUsers model) ]
                    , div [] [ text ("Session ID: " ++ model.room) ]
                    , div [] [ text (String.fromInt (List.length model.messages) ++ " messages.") ]
                    , div [ id "chat-wrapper" ]
                        [ div [ id "chat-entries" ] <|
                            List.map (showItem model) model.messages
                        ]
                    ]
                , div [ id "footer_wrapper", class "fixed-bottom" ]
                    [ div [ id "footer" ]
                        [ input
                            [ value model.chatInput
                            , style "height" "30px"
                            , style "width" "90vw"
                            , onInput InputComment
                            , onKeyDown CommentBoxKeyDown
                            ]
                            []
                        , button [ class "btn btn-primary", onClick SubmitComment ] [ text "送信" ]
                        ]
                    ]
                ]
            ]
        ]
    }


historyView model =
    { title = "Slack clone"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "col-md-10 col-lg-10" ]
                    [ div [] <|
                        List.map
                            (\m ->
                                button
                                    [ type_ "button"
                                    , class
                                        ("btn btn-"
                                            ++ (if isSelected model m then
                                                    "primary"

                                                else
                                                    "secondary"
                                               )
                                        )
                                    , onClick (ToggleMember m)
                                    ]
                                    [ text m ]
                            )
                            (getMembers model.messages)
                    , div [ id "chat-wrapper" ]
                        [ div [ id "chat-entries" ] <|
                            List.map (showItem model) (messageFilter model.room model.messages)
                        ]
                    , div [ id "footer_wrapper", class "fixed-bottom" ]
                        [ div [ id "footer" ]
                            [ input
                                [ value model.chatInput
                                , style "height" "30px"
                                , style "width" "90vw"
                                , onInput InputComment
                                , onKeyDown CommentBoxKeyDown
                                ]
                                []
                            , button [ class "btn btn-primary", onClick SubmitComment ] [ text "送信" ]
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch
        [ feedMessages FeedMessages
        , receiveNewRoomInfo ReceiveNewSessionId
        , feedRoomInfo FeedRoomInfo
        , feedSessionsWithSameMembers (\s -> NewSessionMsg (FeedSessionsWithSameMembers s))
        ]


initialMessages =
    [-- Comment {comment = "昨日の論文の件はどうなりましたか？\n明日作業できればと思っています\nいかがでしょうか？", user = "fuga"}
    ]


getMembers : List ChatEntry -> List String
getMembers entries =
    let
        f c =
            case c of
                Comment { user } ->
                    user

                ChatFile { user } ->
                    user
    in
    List.Extra.unique <| List.map f entries


showAll messages =
    Dict.fromList <| List.map (\m -> ( m, True )) (getMembers messages)


type alias Flags =
    ()
