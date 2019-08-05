port module Main exposing (ChatEntry(..), Flags, Member, Model, Msg(..), addComment, feedMessages, feedUserMessages, getMembers, getMessages, getUserMessages, iconOfUser, init, isSelected, main, mkComment, onKeyDown, scrollTo, showAll, showItem, subscriptions, update, view)

import Browser
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Json.Decode.Extra as JE
import List.Extra
import Maybe.Extra exposing (..)
import Set


port getUsers : () -> Cmd msg


port feedUsers : (List User -> msg) -> Sub msg


port getMessages : RoomID -> Cmd msg


port getUserMessages : String -> Cmd msg


port getRoomInfo : () -> Cmd msg


port getSessionsWithSameMembers : { members : List String, is_all : Bool } -> Cmd msg


port getSessionsOf : String -> Cmd msg


port feedSessionsWithSameMembers : (List String -> msg) -> Sub msg


port feedSessionsOf : (List String -> msg) -> Sub msg


port scrollTo : String -> Cmd msg


port createNewSession : ( String, List Member ) -> Cmd msg


port feedMessages : (Json.Value -> msg) -> Sub msg


port feedUserMessages : (Json.Value -> msg) -> Sub msg


port feedRoomInfo : (Json.Value -> msg) -> Sub msg


port receiveNewRoomInfo : ({ name : String, id : RoomID, timestamp : Int } -> msg) -> Sub msg


port hashChanged : (String -> msg) -> Sub msg


port sendCommentToServer : { user : String, comment : String, session : String } -> Cmd msg


port removeItemRemote : String -> Cmd msg


port sendRoomName : { id : String, new_name : String } -> Cmd msg


port setPageHash : String -> Cmd msg


port recalcElementPositions : Bool -> Cmd msg


port onSocket : (Json.Value -> msg) -> Sub msg


port joinRoom : { session_id : String, user_id : String } -> Cmd msg

port logout : () -> Cmd msg

type alias CommentTyp =
    { id : String
    , user : String
    , comment : String
    , session : String
    , timestamp : String
    , originalUrl : String
    , sentTo : String
    , source : String
    }


type alias SessionEventTyp =
    { id : String
    , session : String
    , user : String
    , timestamp : String
    , action : String
    }


type alias User =
    { username : String, id : String, fullname : String, emails : List String, avatar : String }


type ChatEntry
    = Comment CommentTyp
    | ChatFile { id : String, user : String, filename : String }
    | SessionEvent SessionEventTyp


chatEntriesDecoder : Json.Decoder (List ChatEntry)
chatEntriesDecoder =
    Json.list chatEntryDecoder


commentTypDecoder =
    Json.succeed CommentTyp
        |> JE.andMap (Json.field "id" Json.string)
        |> JE.andMap (Json.field "user" Json.string)
        |> JE.andMap (Json.field "comment" Json.string)
        |> JE.andMap (Json.field "session" Json.string)
        |> JE.andMap (Json.field "timestamp" Json.string)
        |> JE.andMap (Json.field "originalUrl" Json.string)
        |> JE.andMap (Json.field "sentTo" Json.string)
        |> JE.andMap (Json.field "source" Json.string)


sessionEventTypDecoder =
    Json.succeed SessionEventTyp
        |> JE.andMap (Json.field "id" Json.string)
        |> JE.andMap (Json.field "session" Json.string)
        |> JE.andMap (Json.field "user" Json.string)
        |> JE.andMap (Json.field "timestamp" Json.string)
        |> JE.andMap (Json.field "action" Json.string)


chatEntryDecoder : Json.Decoder ChatEntry
chatEntryDecoder =
    Json.field "kind" Json.string
        |> Json.andThen
            (\kind ->
                case kind of
                    "comment" ->
                        Json.map Comment <| commentTypDecoder

                    "event" ->
                        Json.map SessionEvent <| sessionEventTypDecoder

                    _ ->
                        Json.fail "Unsupported kind"
            )


type alias Member =
    String


type alias RoomID =
    String


type alias RoomInfo =
    { id : String
    , name : String
    , timestamp : String
    , members : List Member
    , firstMsgTime : Int
    , lastMsgTime : Int
    , numMessages : Dict String Int
    }


roomInfoListDecoder : Json.Decoder (List RoomInfo)
roomInfoListDecoder =
    Json.list roomInfoDecoder


roomInfoDecoder : Json.Decoder RoomInfo
roomInfoDecoder =
    Json.map7 RoomInfo
        (Json.field "id" Json.string)
        (Json.field "name" Json.string)
        (Json.field "timestamp" Json.string)
        (Json.field "members" (Json.list Json.string))
        (Json.field "firstMsgTime" Json.int)
        (Json.field "lastMsgTime" Json.int)
        (Json.field "numMessages" (Json.dict Json.int))


getId : ChatEntry -> String
getId c =
    case c of
        Comment { id } ->
            id

        ChatFile { id } ->
            id

        SessionEvent { id } ->
            id


getUser : ChatEntry -> String
getUser c =
    case c of
        Comment { user } ->
            user

        ChatFile { user } ->
            user

        SessionEvent { user } ->
            user


getKind : ChatEntry -> String
getKind c =
    case c of
        Comment _ ->
            "comment"

        ChatFile _ ->
            "file"

        SessionEvent _ ->
            "event"


type alias NewSessionStatus =
    { selected : Set.Set Member
    , sessions_same_members : List RoomID
    }


type alias UserPageModel =
    { sessions : List RoomID, messages : List ChatEntry }


type FilterMode
    = Date
    | Person
    | Thread


type alias ChatPageModel =
    { filterMode : FilterMode
    , filter : Set.Set String
    , users : List String
    , messages : Maybe (List ChatEntry)
    , topPaneExpanded : Bool
    }


type Page
    = RoomPage RoomID
    | UserPage String
    | HomePage
    | NewSession


pageToPath : Page -> String
pageToPath page =
    case page of
        RoomPage r ->
            "/sessions/" ++ r

        UserPage u ->
            "/users/" ++ u

        HomePage ->
            "/"

        NewSession ->
            "/sessions/new"



-- FIXME


pathToPage : String -> Page
pathToPage hash =
    case Maybe.withDefault [] <| List.tail (String.split "/" hash) of
        "sessions" :: r :: ts ->
            if r == "new" then
                NewSession

            else
                RoomPage r

        "users" :: u :: ts ->
            UserPage u

        _ ->
            HomePage


type alias Model =
    { page : Page
    , rooms : List RoomID
    , users : List User
    , onlineUsers : List Member
    , myself : Member
    , selected : Dict Member Bool
    , roomInfo : Dict RoomID RoomInfo
    , newSessionStatus : NewSessionStatus
    , userPageStatus : UserPageModel
    , chatPageStatus : ChatPageModel
    , editing : Set.Set String
    , editingValue : Dict String String
    }


getRoomID : Model -> Maybe RoomID
getRoomID model =
    case model.page of
        RoomPage r ->
            Just r

        _ ->
            Nothing


init : Flags -> ( Model, Cmd Msg )
init { user_id } =
    ( { selected = showAll []
      , onlineUsers = []
      , myself = user_id
      , roomInfo = Dict.empty
      , rooms = [ "Home", "COI" ]
      , page = NewSession
      , users = []
      , newSessionStatus = { selected = Set.empty, sessions_same_members = [] }
      , userPageStatus = { sessions = [], messages = [] }
      , chatPageStatus = { filterMode = Thread, filter = Set.empty, users = [], messages = Nothing, topPaneExpanded = True }
      , editing = Set.empty
      , editingValue = Dict.empty
      }
    , Cmd.batch [ getRoomInfo (), getUsers () ]
    )


main : Program Flags Model Msg
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type Msg
    = ToggleMember Member
    | EnterRoom RoomID
    | EnterUser String
    | NewSessionMsg NewSessionMsg
    | UserPageMsg UserPageMsg
    | ChatPageMsg ChatPageMsg
    | StartSession (Set.Set Member)
    | ReceiveNewSessionId { timestamp : Int, name : String, id : RoomID }
    | FeedRoomInfo Json.Value
    | FeedUsers (List User)
    | EnterNewSessionScreen
    | StartEditing String String
    | UpdateEditingValue String String
    | FinishEditing String (Model -> Model) (Cmd Msg)
    | AbortEditing String
    | EditingKeyDown String (Model -> Model) (Cmd Msg) Int
    | SubmitComment
    | SetPageHash
    | HashChanged String
    | OnSocket Json.Value
    | Logout
    | NoOp


type NewSessionMsg
    = TogglePersonInNew Member
    | FeedSessionsWithSameMembers (List String)


type UserPageMsg
    = FeedSessions (List String)
    | FeedUserMessages (List ChatEntry)


type ChatPageMsg
    = SetFilterMode FilterMode
    | SetFilter String Bool
    | ScrollToBottom
    | FeedMessages (List ChatEntry)
    | RemoveItem String
    | ExpandTopPane Bool


onKeyDown : (Int -> msg) -> Attribute msg
onKeyDown tagger =
    on "keydown" (Json.map tagger keyCode)


addComment : String -> Model -> Model
addComment comment model =
    if comment /= "" then
        case model.chatPageStatus.messages of
            Just messages ->
                let
                    chatPageStatus =
                        model.chatPageStatus

                    msgs =
                        Just <| List.append messages [ Comment { id = "__latest", user = model.myself, comment = comment, originalUrl = "", sentTo = "all", timestamp = "", session = "", source = "self" } ]
                in
                { model | chatPageStatus = { chatPageStatus | messages = msgs }, editingValue = Dict.insert "chat" "" model.editingValue }

            Nothing ->
                model

    else
        model


updatePageHash : Model -> Cmd Msg
updatePageHash model =
    setPageHash (pageToPath model.page)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        ToggleMember m ->
            let
                v =
                    not (Dict.get m model.selected == Just True)
            in
            ( { model | selected = Dict.insert m v model.selected }, Cmd.none )

        FeedUsers users ->
            let _ = 1 in
            ( { model | users = users }, Cmd.none )

        FeedRoomInfo v ->
            let
                rs1 =
                    Json.decodeValue roomInfoListDecoder v
            in
            case rs1 of
                Ok rs ->
                    ( { model | roomInfo = Dict.fromList (List.map (\r -> ( r.id, r )) rs), rooms = List.map (\r -> r.id) rs }, Cmd.none )

                Err err ->
                    ( model, Cmd.none )

        EnterRoom r ->
            enterRoom r model

        EnterUser u ->
            enterUser u model

        NewSessionMsg msg1 ->
            let
                ( m, c ) =
                    updateNewSessionStatus msg1 model.newSessionStatus
            in
            ( { model | newSessionStatus = m }, c )

        UserPageMsg msg1 ->
            let
                ( m, c ) =
                    updateUserPageStatus msg1 model.userPageStatus
            in
            ( { model | userPageStatus = m }, c )

        ChatPageMsg msg1 ->
            let
                ( m, c ) =
                    updateChatPageStatus msg1 model.chatPageStatus
            in
            ( { model | chatPageStatus = m }, c )

        StartSession users ->
            let
                user_list =
                    Set.toList users
            in
            ( { model | page = RoomPage "" }, Cmd.batch [ createNewSession ( "", user_list ), updatePageHash model ] )

        ReceiveNewSessionId { name, timestamp, id } ->
            let
                newRoomInfo =
                    { id = id, name = name, timestamp = timestamp, members = [], numMessages = Dict.empty, firstMsgTime = -1, lastMsgTime = -1 }

                _ =
                    Debug.log "newRoomInfo" newRoomInfo
            in
            enterRoom id model

        EnterNewSessionScreen ->
            enterNewSession model

        StartEditing id initialValue ->
            ( { model | editing = Set.insert id model.editing, editingValue = Dict.insert id initialValue model.editingValue }, Cmd.none )

        FinishEditing id updateFunc updatePort ->
            finishEditing id updateFunc updatePort model

        AbortEditing id ->
            ( { model | editing = Set.remove id model.editing }, Cmd.none )

        UpdateEditingValue id newValue ->
            ( { model | editingValue = Dict.insert id newValue model.editingValue }, Cmd.none )

        EditingKeyDown id updateFunc updatePort code ->
            if code == 13 then
                finishEditing id updateFunc updatePort model

            else
                ( model, Cmd.none )

        SubmitComment ->
            case ( Dict.get "chat" model.editingValue, getRoomID model ) of
                ( Just comment, Just room ) ->
                    ( addComment comment model, Cmd.batch [ scrollTo "__latest", sendCommentToServer { comment = comment, user = model.myself, session = room } ] )

                _ ->
                    ( model, Cmd.none )

        SetPageHash ->
            ( model, setPageHash (pageToPath model.page) )

        HashChanged hash ->
            if hash /= pageToPath model.page then
                case pathToPage hash of
                    UserPage u ->
                        enterUser u model

                    RoomPage r ->
                        enterRoom r model

                    HomePage ->
                        enterHome model

                    NewSession ->
                        enterNewSession model

            else
                ( model, Cmd.none )

        Logout ->
            (model, logout ())

        OnSocket v ->
            case Json.decodeValue socketDecoder v of
                Ok (NewComment v1) ->
                    let
                        _ =
                            Debug.log "OnSocket NewComment" v1
                    in
                    if RoomPage v1.session /= model.page then
                        ( model, Cmd.none )

                    else
                        let
                            f : CommentTyp -> ChatEntry
                            f { id, user, comment, timestamp, session, originalUrl, sentTo, source } =
                                Comment { id = id, user = user, comment = comment, timestamp = timestamp, originalUrl = originalUrl, sentTo = sentTo, session = session, source = source }

                            cm =
                                model.chatPageStatus
                        in
                        ( { model
                            | chatPageStatus =
                                { cm
                                    | messages =
                                        Just
                                            (Maybe.withDefault [] cm.messages
                                                ++ [ f v1 ]
                                            )
                                }
                          }
                        , scrollTo v1.id
                        )

                Ok (DeleteComment { session_id, comment_id }) ->
                    if RoomPage session_id /= model.page then
                        ( model, Cmd.none )

                    else
                        let
                            cm =
                                model.chatPageStatus
                        in
                        case cm.messages of
                            Just msgs ->
                                ( { model
                                    | chatPageStatus =
                                        { cm
                                            | messages =
                                                Just <|
                                                    List.filter (\m -> getId m /= comment_id) msgs
                                        }
                                  }
                                , Cmd.none
                                )

                            Nothing ->
                                ( model, Cmd.none )

                Ok (NewSessionSocket info) ->
                    ( { model | roomInfo = Dict.insert info.id info model.roomInfo, rooms = info.id :: model.rooms }, Cmd.none )

                Ok (NewMemberSocket { session_id, user_id, timestamp }) ->
                    if RoomPage session_id /= model.page then
                        ( model, Cmd.none )

                    else
                        let
                            f : String -> String -> String -> ChatEntry
                            f session user ts =
                                let
                                    a =
                                        SessionEvent { id = "", user = user, timestamp = ts, session = session, action = "join" }

                                    _ =
                                        Debug.log "sessionevent" a
                                in
                                a

                            cm =
                                model.chatPageStatus

                            _ =
                                Debug.log "cm length" ( List.length (Maybe.withDefault [] cm.messages), List.length new_msgs )

                            new_msgs =
                                Maybe.withDefault [] cm.messages
                                    ++ [ f session_id user_id timestamp ]
                        in
                        ( { model
                            | chatPageStatus =
                                { cm
                                    | messages =
                                        Just new_msgs
                                    , filter = Set.insert user_id cm.filter
                                    , users = cm.users ++ [ user_id ]
                                }
                          }
                        , Cmd.none
                        )

                Err e ->
                    let
                        _ =
                            Debug.log "Error in OnSocket parsing: " e
                    in
                    ( model, Cmd.none )



-- type alias NewCommentMsg =
--     { id : String, session : String, user : String, timestamp : String, comment : String, originalUrl : String, sentTo : String, source : String }


type alias DeleteCommentMsg =
    { comment_id : String, session_id : String }


type SocketMsg
    = NewComment CommentTyp
    | DeleteComment DeleteCommentMsg
    | NewSessionSocket RoomInfo
    | NewMemberSocket { session_id : String, user_id : String, timestamp : String }


socketDecoder : Json.Decoder SocketMsg
socketDecoder =
    Json.field "__type" Json.string
        |> Json.andThen socketMsg


socketMsg m =
    case m of
        "new_comment" ->
            let
                _ =
                    Debug.log "new_comment, OK so far" ""
            in
            Json.map NewComment <|
                (Json.succeed CommentTyp
                    |> JE.andMap (Json.field "id" Json.string)
                    |> JE.andMap (Json.field "user_id" Json.string)
                    |> JE.andMap (Json.field "comment" Json.string)
                    |> JE.andMap (Json.field "session_id" Json.string)
                    |> JE.andMap (Json.field "timestamp" Json.string)
                    |> JE.andMap (Json.field "original_url" Json.string)
                    |> JE.andMap (Json.field "sent_to" Json.string)
                    |> JE.andMap (Json.field "source" Json.string)
                )

        "delete_comment" ->
            let
                _ =
                    Debug.log "delete_comment, OK so far" ""
            in
            Json.map DeleteComment <|
                Json.map2 DeleteCommentMsg
                    (Json.field "comment_id" Json.string)
                    (Json.field "session_id" Json.string)

        "new_session" ->
            let
                _ =
                    Debug.log "new_session, OK so far" ""
            in
            Json.map NewSessionSocket <| roomInfoDecoder

        "new_member" ->
            let
                _ =
                    Debug.log "new_member, OK so far" ""
            in
            Json.map NewMemberSocket <|
                Json.map3 (\a b c -> { session_id = a, user_id = b, timestamp = c })
                    (Json.field "session_id" Json.string)
                    (Json.field "user_id" Json.string)
                    (Json.field "timestamp" Json.string)

        s ->
            Json.fail ("Message <" ++ s ++ "> Not implemented yet")


enterNewSession model =
    let
        new_model =
            { model | page = NewSession, newSessionStatus = { selected = Set.empty, sessions_same_members = [] } }
    in
    ( new_model, updatePageHash new_model )


enterHome model =
    ( { model | page = HomePage }, Cmd.none )


enterRoom : String -> Model -> ( Model, Cmd Msg )
enterRoom r model =
    let
        users =
            []

        chatPageStatus =
            model.chatPageStatus

        new_model =
            { model | page = RoomPage r, chatPageStatus = { chatPageStatus | filterMode = Person, filter = Set.fromList users, users = users, messages = Nothing } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getMessages r, joinRoom { session_id = r, user_id = model.myself } ] )


enterUser : String -> Model -> ( Model, Cmd Msg )
enterUser u model =
    let
        new_model =
            { model | page = UserPage u, userPageStatus = { sessions = [], messages = [] } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getSessionsOf u, getUserMessages u ] )


finishEditing : String -> (Model -> Model) -> Cmd Msg -> Model -> ( Model, Cmd Msg )
finishEditing id updateFunc updatePort model =
    ( updateFunc { model | editing = Set.remove id model.editing }, updatePort )


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
            ( { model | selected = newSelected }
            , if Set.isEmpty newSelected then
                Cmd.none

              else
                getSessionsWithSameMembers { members = Set.toList newSelected, is_all = True }
            )

        FeedSessionsWithSameMembers ss ->
            ( { model | sessions_same_members = ss }, Cmd.none )


updateUserPageStatus : UserPageMsg -> UserPageModel -> ( UserPageModel, Cmd msg )
updateUserPageStatus msg model =
    case msg of
        FeedSessions ss ->
            ( { model | sessions = ss }, Cmd.none )

        FeedUserMessages ms ->
            ( { model | messages = ms }, Cmd.none )


updateChatPageStatus : ChatPageMsg -> ChatPageModel -> ( ChatPageModel, Cmd msg )
updateChatPageStatus msg model =
    case msg of
        SetFilterMode mode ->
            ( { model | filterMode = mode }, Cmd.none )

        SetFilter item enabled ->
            let
                _ =
                    Debug.log "setfilter" model.filter
            in
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
            let
                messages_filtered =
                    List.filter (\m -> Set.member (getUser m) model.filter) (Maybe.withDefault [] model.messages)
            in
            case List.Extra.last messages_filtered of
                Just item ->
                    ( model, scrollTo (getId item) )

                Nothing ->
                    ( model, Cmd.none )

        FeedMessages ms ->
            let
                users =
                    getMembers ms
            in
            ( { model | messages = Just ms, users = users, filter = Set.fromList users }, Cmd.none )

        RemoveItem id ->
            removeItem id model

        ExpandTopPane b ->
            ( { model | topPaneExpanded = b }, recalcElementPositions b )


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
        f s1 =
            if s1 == "\n" then
                br [] []

            else
                text s1
    in
    List.map f <| List.intersperse "\n" <| String.split "\n" s



-- https://avatars.discourse.org/v4/letter/t/cc2283/60.png


iconOfUser : String -> String
iconOfUser name =
    let
        c =
            String.toLower (String.left 1 name)
    in
    "/public/img/" ++ c ++ ".png"


showSource : String -> Html Msg
showSource s =
    case s of
        "email" ->
            text "Email"

        "self" ->
            text "self"

        _ ->
            text "(unknown)"


showItem : Model -> ChatEntry -> Html Msg
showItem model entry =
    case entry of
        Comment m ->
            div [ class "chat_entry_comment", id m.id ]
                [ div [ style "float" "left" ] [ img [ class "chat_user_icon", src (iconOfUser m.user) ] [] ]
                , div [ class "chat_comment" ]
                    [ div [ class "chat_user_name" ]
                        [ text
                            (getUserName model m.user
                                ++ (if m.sentTo /= "" then
                                        " to " ++ getUserName model m.sentTo

                                    else
                                        ""
                                   )
                            )
                        , span [ class "chat_timestamp" ]
                            [ text m.timestamp
                            ]
                        , a [ href m.originalUrl ] [ showSource m.source ]
                        , span [ class "remove-item clickable", onClick (ChatPageMsg (RemoveItem m.id)) ] [ text "×" ]
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

        SessionEvent e ->
            div [ class "chat_entry_event", id e.id ] [ hr [] [], text <| getUserName model e.user ++ "が参加しました（" ++ e.timestamp ++ "）", hr [] [] ]


isSelected : Model -> Member -> Bool
isSelected model m =
    Dict.get m model.selected == Just True


roomUsers : String -> Model -> List String
roomUsers room model =
    Maybe.withDefault [] <| Maybe.map (\a -> a.members) <| Dict.get room model.roomInfo


leftMenu : Model -> Html Msg
leftMenu model =
    div [ class "d-none d-md-block col-md-5 col-lg-2", id "menu-left-wrapper" ]
        [ div [ id "menu-left" ]
            ([ div [ id "username-top" ]
                [ text (getUserName model model.myself),
                    a [onClick Logout, class "clickable", id "logout-button"] [text "ログアウト"] ]
             , div [ id "path" ] [ text (pageToPath model.page) ]
             , div []
                [ a [ class "btn btn-light", id "newroom-button", onClick EnterNewSessionScreen ] [ text "新しい会話" ]
                ]
             ]
                ++ showChannels model
            )
        ]


showUsers room model =
    ul [ class "menu-list", id "room-memberlist" ] <|
        List.map (\u -> li [] [ a [ class "clickable", onClick (EnterUser u) ] [ text u ] ]) (roomUsers room model)


truncate n s =
    if String.length s > n then
        String.left n s ++ "..."

    else
        s


getUserName : Model -> String -> String
getUserName model uid =
    case List.Extra.find (\u -> u.id == uid) model.users of
        Just user ->
            user.username

        Nothing ->
            "<"++uid++">"


showChannels : Model -> List (Html Msg)
showChannels model =
    [ p [] [ text "チャンネル" ]
    , ul [ class "menu-list" ] <|
        (List.indexedMap
            (\i r ->
                li []
                    [ hr [] []
                    , div
                        [ class <|
                            "chatlist-name clickable"
                                ++ (if RoomPage r == model.page then
                                        " current"

                                    else
                                        ""
                                   )
                        ]
                        [ a [ onClick (EnterRoom r) ] [ text (String.fromInt (i + 1) ++ ": " ++ roomName r model) ] ]
                    , div [ class "chatlist-members" ] (List.intersperse (text ",") <| List.map (\u -> a [ class "chatlist-member clickable", onClick (EnterUser u) ] [ text (getUserName model u) ]) <| roomUsers r model)
                    ]
            )
            model.rooms
         -- ++ [li [] [div [ class "chatlist-name" ] [a [id "measure-width"] []]]]
        )
    ]


roomName : String -> Model -> String
roomName id model =
    Maybe.withDefault "" <| Maybe.map .name (Dict.get id model.roomInfo)


view : Model -> Browser.Document Msg
view model =
    case model.page of
        NewSession ->
            newSessionView model

        RoomPage room ->
            chatRoomView room model

        UserPage user ->
            userPageView user model

        HomePage ->
            homeView model


homeView : Model -> { title : String, body : List (Html Msg) }
homeView model =
    { title = "Slack clone"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-2 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "新しい会話を開始" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (\u -> mkPeoplePanel model model.newSessionStatus.selected u.id)
                            model.users
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (StartSession model.newSessionStatus.selected) ] [ text "開始" ] ]
                    , ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionStatus.sessions_same_members)
                    ]
                ]
            ]
        ]
    }


mkPeoplePanel : Model -> Set.Set String -> String -> Html Msg
mkPeoplePanel model selected user =
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
        [ h3 [ class "name" ] [ text (getUserName model user) ] ]


newSessionView : Model -> { title : String, body : List (Html Msg) }
newSessionView model =
    { title = "Slack clone"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-2 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "新しい会話を開始" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (\u -> mkPeoplePanel model model.newSessionStatus.selected u.id)
                            model.users
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (StartSession model.newSessionStatus.selected) ] [ text "開始" ] ]
                    , ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionStatus.sessions_same_members)
                    ]
                ]
            ]
        ]
    }


updateRoomName : RoomID -> String -> Model -> Model
updateRoomName room newName model =
    let
        f _ v =
            if v.id == room then
                { v | name = newName }

            else
                v
    in
    { model | roomInfo = Dict.map f model.roomInfo }


topPane : Model -> Html Msg
topPane model =
    let
        klass n =
            class <|
                "btn btn-sm btn-light"
                    ++ (if model.chatPageStatus.filterMode == n then
                            " active"

                        else
                            ""
                       )
    in
    div [ class "row" ]
        [ div
            [ id "top-pane"
            , class
                ("col-md-12 col-lg-12"
                    ++ (if model.chatPageStatus.topPaneExpanded then
                            ""

                        else
                            " shrunk"
                       )
                )
            ]
            [ div []
                [ if model.chatPageStatus.topPaneExpanded then
                    button [ id "top-pane-expand-button", class "btn btn-sm btn-light", onClick (ChatPageMsg <| ExpandTopPane False) ] [ i [ class "fas fa-angle-down" ] [] ]

                  else
                    button [ id "top-pane-expand-button", class "btn btn-sm btn-light", onClick (ChatPageMsg <| ExpandTopPane True) ] [ i [ class "fas fa-angle-right" ] [] ]
                , span [ class "top-page-menu-label" ] [ text "フィルタ" ]
                , button [ klass Thread, onClick (ChatPageMsg <| SetFilterMode Thread) ] [ text "スレッド" ]
                , button [ klass Person, onClick (ChatPageMsg <| SetFilterMode Person) ] [ text "人" ]
                , button [ klass Date, onClick (ChatPageMsg <| SetFilterMode Date) ] [ text "日付" ]
                ]
            , if model.chatPageStatus.topPaneExpanded then
                case model.chatPageStatus.filterMode of
                    Thread ->
                        div [ id "top-pane-list-container" ]
                            [ ul [] <| List.map (\r -> li [] [ input [ type_ "checkbox" ] [], span [ class "clickable", onClick (EnterRoom r) ] [ text (roomName r model) ] ]) model.rooms
                            ]

                    Date ->
                        div [] []

                    Person ->
                        div [ id "top-pane-list-container" ]
                            [ ul [] <| List.map (\u -> li [] [ input [ type_ "checkbox", checked (Set.member u model.chatPageStatus.filter), onCheck (\b -> ChatPageMsg <| SetFilter u b) ] [], span [ class "clickable", onClick (EnterUser u) ] [ text (getUserName model u) ] ]) model.chatPageStatus.users
                            ]

              else
                text ""
            ]
        ]


chatRoomView : RoomID -> Model -> { title : String, body : List (Html Msg) }
chatRoomView room model =
    { title = "Slack clone"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ topPane model
                    , div [ class "row" ]
                        [ div [ class "col-md-12 col-lg-12" ]
                            [ div [ class "col-md-12 col-lg-12", id "chat-outer" ]
                                [ h1 []
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
                                    ]
                                , div [] ([ text <| "参加者：" ] ++ List.intersperse (text ", ") (List.map (\u -> a [ onClick (EnterUser u), class "clickable" ] [ text (getUserName model u) ]) (roomUsers room model)))
                                , div []
                                    (text ("Session ID: " ++ room)
                                        :: (case model.chatPageStatus.messages of
                                                Just messages ->
                                                    let
                                                        messages_filtered =
                                                            List.filter (\m -> Set.member (getUser m) model.chatPageStatus.filter) messages

                                                        messages_filtered_nonevent =
                                                            List.filter (\m -> getKind m /= "event") messages_filtered
                                                    in
                                                    [ div [ id "message-count" ]
                                                        [ text (String.fromInt (List.length messages_filtered_nonevent) ++ " messages.")
                                                        , button [ class "btn-sm btn-light btn", onClick (ChatPageMsg ScrollToBottom) ] [ text "⬇⬇" ]
                                                        ]
                                                    , div [ id "chat-wrapper" ]
                                                        [ div
                                                            [ id "chat-entries" ]
                                                          <|
                                                            List.map (showItem model) messages_filtered
                                                        ]
                                                    ]

                                                Nothing ->
                                                    []
                                           )
                                    )
                                ]
                            ]
                        ]
                    , div [ class "row", id "footer_wrapper" ]
                        [ div [ class "col-md-12 col-lg-12", id "footer" ]
                            [ input
                                [ value (Maybe.withDefault "" <| Dict.get "chat" model.editingValue)
                                , onInput (UpdateEditingValue "chat")
                                , onKeyDown
                                    (case Dict.get "chat" model.editingValue of
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
                                    )
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


numSessionMessages : RoomID -> Model -> Int
numSessionMessages id model =
    case Dict.get id model.roomInfo of
        Just room ->
            Maybe.withDefault 0 <| Dict.get "__total" room.numMessages

        Nothing ->
            0


getMessageCount : String -> Model -> String
getMessageCount session_id model =
    case Dict.get session_id model.roomInfo of
        Just room ->
            let
                total =
                    Maybe.withDefault 0 <| Dict.get "__total" room.numMessages

                cs =
                    Dict.toList room.numMessages
            in
            String.fromInt total
                ++ " total. "
                ++ (String.join "," <|
                        List.filterMap
                            (\( name, count ) ->
                                if name == "__total" then
                                    Nothing

                                else
                                    Just <| getUserName model name ++ "(" ++ String.fromInt count ++ ")"
                            )
                            cs
                   )

        Nothing ->
            "N/A"


userPageView : String -> Model -> { title : String, body : List (Html Msg) }
userPageView user model =
    { title = "Slack clone"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "offset-md-2 offset-lg-2 col-md-10 col-lg-10" ]
                    [ h1 [] [ text (getUserName model user) ]
                    , div [] [ text <| String.fromInt (List.length model.userPageStatus.messages) ++ " messages in " ++ String.fromInt (List.length model.userPageStatus.sessions) ++ " rooms." ]
                    , div [] <|
                        List.map
                            (\s ->
                                div [ class "userpage-room-entry" ]
                                    [ span [ class "session_id" ] [ text <| "ID: " ++ s ]
                                    , h3 [ class "clickable", onClick (EnterRoom s) ] [ text <| roomName s model ]
                                    , span [] [ text <| getMessageCount s model ]
                                    ]
                            )
                            model.userPageStatus.sessions
                    ]
                ]
            ]
        ]
    }


messageFilter : ChatEntry -> ChatEntry
messageFilter =
    identity


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ feedUsers FeedUsers
        , feedMessages (\ms -> ChatPageMsg <| FeedMessages (Result.withDefault [] (Json.decodeValue chatEntriesDecoder ms)))
        , feedUserMessages (\ms -> UserPageMsg <| FeedUserMessages (Result.withDefault [] (Json.decodeValue chatEntriesDecoder ms)))
        , receiveNewRoomInfo ReceiveNewSessionId
        , hashChanged HashChanged
        , feedRoomInfo FeedRoomInfo
        , feedSessionsWithSameMembers (\s -> NewSessionMsg (FeedSessionsWithSameMembers s))
        , feedSessionsOf (\s -> UserPageMsg (FeedSessions s))
        , onSocket OnSocket
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

                SessionEvent { user } ->
                    user
    in
    List.Extra.unique <| List.map f entries


showAll : List ChatEntry -> Dict String Bool
showAll messages =
    Dict.fromList <| List.map (\m -> ( m, True )) (getMembers messages)


type alias Flags =
    { user_id : String }
