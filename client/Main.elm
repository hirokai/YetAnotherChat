port module Main exposing (ChatEntry(..), Flags, Member, Model, Msg(..), addComment, feedMessages, feedUserMessages, getMembers, getMessages, getUserMessages, iconOfUser, init, isSelected, main, mkComment, onKeyDown, scrollToBottom, showAll, showItem, subscriptions, update, view)

import Browser
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import List.Extra
import Set


type alias CommentTyp =
    { user : String
    , comment : String
    , timestamp : String
    , originalUrl : String
    , sentTo : String
    }


port getMessages : RoomID -> Cmd msg


port getUserMessages : String -> Cmd msg


port getRoomInfo : () -> Cmd msg


port getSessionsWithSameMembers : { members : List String, is_all : Bool } -> Cmd msg


port getSessionsOf : String -> Cmd msg


port feedSessionsWithSameMembers : (List String -> msg) -> Sub msg


port feedSessionsOf : (List String -> msg) -> Sub msg


port scrollToBottom : () -> Cmd msg


port createNewSession : ( String, List Member ) -> Cmd msg


port feedMessages : (List CommentTyp -> msg) -> Sub msg


port feedUserMessages : (List CommentTyp -> msg) -> Sub msg


port feedRoomInfo : (Json.Value -> msg) -> Sub msg


port receiveNewRoomInfo : ({ name : String, id : RoomID, timestamp : Int } -> msg) -> Sub msg


port hashChanged : (String -> msg) -> Sub msg


port sendCommentToServer : { user : String, comment : String, session : String } -> Cmd msg


port sendRoomName : { id : String, new_name : String } -> Cmd msg


port setPageHash : String -> Cmd msg


type ChatEntry
    = Comment CommentTyp
    | ChatFile { user : String, filename : String }


type alias Member =
    String


type alias RoomID =
    String


type alias RoomInfo =
    { id : String
    , name : String
    , timestamp : Int
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
        (Json.field "timestamp" Json.int)
        (Json.field "members" (Json.list Json.string))
        (Json.field "firstMsgTime" Json.int)
        (Json.field "lastMsgTime" Json.int)
        (Json.field "numMessages" (Json.dict Json.int))


getUser : ChatEntry -> String
getUser c =
    case c of
        Comment { user } ->
            user

        ChatFile { user } ->
            user


type alias NewSessionStatus =
    { selected : Set.Set Member
    , sessions_same_members : List RoomID
    }


type alias UserPageModel =
    { sessions : List RoomID, messages : List ChatEntry }


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
    , users : List Member
    , messages : Maybe (List ChatEntry)
    , onlineUsers : List Member
    , myself : Member
    , selected : Dict Member Bool
    , roomInfo : Dict RoomID RoomInfo
    , newSessionStatus : NewSessionStatus
    , userPageStatus : UserPageModel
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
init { username } =
    ( { messages = Nothing
      , selected = showAll []
      , onlineUsers = []
      , myself = username
      , roomInfo = Dict.empty
      , rooms = [ "Home", "COI" ]
      , page = NewSession
      , users = [ "Tanaka", "Yoshida", "Saito", "Kimura", "Abe" ]
      , newSessionStatus = { selected = Set.empty, sessions_same_members = [] }
      , userPageStatus = { sessions = [], messages = [] }
      , editing = Set.empty
      , editingValue = Dict.empty
      }
    , Cmd.batch [ getRoomInfo () ]
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
    | FeedMessages (List CommentTyp)
    | EnterRoom RoomID
    | EnterUser String
    | NewSessionMsg NewSessionMsg
    | UserPageMsg UserPageMsg
    | StartSession (Set.Set Member)
    | ReceiveNewSessionId { timestamp : Int, name : String, id : RoomID }
    | FeedRoomInfo Json.Value
    | EnterNewSessionScreen
    | StartEditing String String
    | UpdateEditingValue String String
    | FinishEditing String (Model -> Model) (Cmd Msg)
    | AbortEditing String
    | EditingKeyDown String (Model -> Model) (Cmd Msg) Int
    | SubmitComment
    | SetPageHash
    | HashChanged String
    | NoOp


type NewSessionMsg
    = TogglePersonInNew Member
    | FeedSessionsWithSameMembers (List String)


type UserPageMsg
    = FeedSessions (List String)
    | FeedUserMessages (List CommentTyp)


onKeyDown : (Int -> msg) -> Attribute msg
onKeyDown tagger =
    on "keydown" (Json.map tagger keyCode)


addComment : String -> Model -> Model
addComment comment model =
    case model.messages of
        Just messages ->
            { model | messages = Just <| List.append messages [ Comment { user = model.myself, comment = comment, originalUrl = "", sentTo = "all", timestamp = "" } ] }

        Nothing ->
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

        FeedMessages ms ->
            let
                f { user, comment, timestamp, originalUrl, sentTo } =
                    Comment { user = user, comment = comment, timestamp = timestamp, originalUrl = originalUrl, sentTo = sentTo }

                msgs =
                    List.map f ms
            in
            ( { model | messages = Just msgs, selected = showAll msgs }, Cmd.none )

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

        StartSession users ->
            let
                user_list =
                    Set.toList users
            in
            ( { model | page = RoomPage "" }, Cmd.batch [ createNewSession ( "", user_list ), updatePageHash model ] )

        ReceiveNewSessionId { name, timestamp, id } ->
            ( { model | page = RoomPage id, roomInfo = Dict.insert id { id = id, name = name, timestamp = timestamp, members = [], numMessages = Dict.empty, firstMsgTime = -1, lastMsgTime = -1 } model.roomInfo }, updatePageHash model )

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
                    ( addComment comment model, Cmd.batch [ scrollToBottom (), sendCommentToServer { comment = comment, user = model.myself, session = room } ] )

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


enterNewSession model =
    let
        new_model =
            { model | page = NewSession, newSessionStatus = { selected = Set.empty, sessions_same_members = [] } }
    in
    ( new_model, updatePageHash new_model )


enterHome model =
    ( { model | page = HomePage }, Cmd.none )


enterRoom r model =
    let
        new_model =
            { model | page = RoomPage r, messages = Nothing }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getMessages r ] )


enterUser u model =
    let
        new_model =
            { model | page = UserPage u, messages = Nothing }
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
            let
                f { user, comment, timestamp, originalUrl, sentTo } =
                    Comment { user = user, comment = comment, timestamp = timestamp, originalUrl = originalUrl, sentTo = sentTo }

                msgs =
                    List.map f ms
            in
            ( { model | messages = msgs }, Cmd.none )


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


iconOfUser : String -> String
iconOfUser name =
    case name of
        "myself" ->
            "/public/img/myself_icon.jpg"

        _ ->
            "/public/img/i.png"


showItem : Model -> ChatEntry -> Html Msg
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


roomUsers : String -> Model -> List String
roomUsers room model =
    Maybe.withDefault [] <| Maybe.map (\a -> a.members) <| Dict.get room model.roomInfo


leftMenu : Model -> Html Msg
leftMenu model =
    div [ class "col-md-2 col-lg-2", id "menu-left" ]
        ([ div [ id "username-top" ]
            [ text model.myself ]
         , div [ id "path" ] [ text (pageToPath model.page) ]
         , div []
            [ a [ class "btn btn-light", id "newroom-button", onClick EnterNewSessionScreen ] [ text "新しい会話" ]
            ]
         ]
            ++ showChannels model
        )


showChannels : Model -> List (Html Msg)
showChannels model =
    case model.page of
        RoomPage room ->
            [ p [] [ text "チャンネル" ]
            , ul [ class "menu-list", id "room-memberlist" ] <|
                List.map (\u -> li [] [ a [ class "clickable", onClick (EnterUser u) ] [ text u ] ]) (roomUsers room model)
            , ul [ class "menu-list" ] <|
                List.map
                    (\r ->
                        li []
                            [ div [ class "chatlist-name clickable" ] [ a [ onClick (EnterRoom r) ] [ text (roomName r model) ] ]
                            , div [ class "chatlist-members" ] (List.intersperse (text ",") <| List.map (\u -> a [ class "chatlist-member clickable", onClick (EnterUser u) ] [ text u ]) <| roomUsers r model)
                            ]
                    )
                    model.rooms
            ]

        _ ->
            [ p [] [ text "チャンネル" ]
            , ul [ class "menu-list" ] <|
                List.map
                    (\r ->
                        li []
                            [ div [ class "chatlist-name clickable" ] [ a [ onClick (EnterRoom r) ] [ text (roomName r model) ] ]
                            , div [ class "chatlist-members" ] (List.intersperse (text ",") <| List.map (\u -> a [ class "chatlist-member clickable", onClick (EnterUser u) ] [ text u ]) <| roomUsers r model)
                            ]
                    )
                    model.rooms
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
                    , ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionStatus.sessions_same_members)
                    ]
                ]
            ]
        ]
    }


mkPeoplePanel : Set.Set String -> String -> Html Msg
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


newSessionView : Model -> { title : String, body : List (Html Msg) }
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
                    , ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionStatus.sessions_same_members)
                    ]
                ]
            ]
        ]
    }



-- inputComponent : (Model -> String) -> (String -> Msg) -> (Int -> Msg) -> Model -> Html Msg
-- inputComponent valueFunc onInputMsg onKeyDownMsg model =
--     (input [ value (valueFunc model), onInput onInputMsg, onKeyDown onKeyDownMsg ] [],
--         \id -> if id ==
-- sessionEditInput : Html Msg
-- sessionEditInput =
--     inputComponent (\m -> m.editingSessionNameValue) UpdateEditingSessionName


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


chatRoomView : RoomID -> Model -> { title : String, body : List (Html Msg) }
chatRoomView room model =
    { title = "Slack clone"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "col-md-10 col-lg-10" ]
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
                    , div [] [ text <| "参加者：" ++ String.join ", " (roomUsers room model) ]
                    , div []
                        (text ("Session ID: " ++ room)
                            :: (case model.messages of
                                    Just messages ->
                                        [ div [ id "message-count" ] [ text (String.fromInt (List.length messages) ++ " messages.") ]
                                        , div [ id "chat-wrapper" ]
                                            [ div
                                                [ id "chat-entries" ]
                                              <|
                                                List.map (showItem model) messages
                                            ]
                                        ]

                                    Nothing ->
                                        []
                               )
                        )
                    ]
                , div [ id "footer_wrapper", class "fixed-bottom" ]
                    [ div [ id "footer" ]
                        [ input
                            [ value (Maybe.withDefault "" <| Dict.get "chat" model.editingValue)
                            , style "height" "30px"
                            , style "width" "90vw"
                            , onInput (UpdateEditingValue "chat")
                            , onKeyDown
                                (case Dict.get "chat" model.editingValue of
                                    Just c ->
                                        EditingKeyDown "chat"
                                            (addComment c)
                                            (sendCommentToServer
                                                { comment = c, user = model.myself, session = room }
                                            )

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
    }


numSessionMessages : RoomID -> Model -> Int
numSessionMessages id model =
    case Dict.get id model.roomInfo of
        Just room ->
            Maybe.withDefault 0 <| Dict.get "__total" room.numMessages

        Nothing ->
            0


userPageView : String -> Model -> { title : String, body : List (Html Msg) }
userPageView user model =
    { title = "Slack clone"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "col-md-10 col-lg-10" ]
                    [ h1 [] [ text user ]
                    , div [] [ text <| String.fromInt (List.length model.userPageStatus.messages) ++ " messages in " ++ String.fromInt (List.length model.userPageStatus.sessions) ++ " rooms." ]
                    , div []
                        [ ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text <| s ++ ": " ++ roomName s model ++ "(" ++ String.fromInt (numSessionMessages s model) ++ ")" ] ]) model.userPageStatus.sessions)
                        ]
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
        [ feedMessages FeedMessages
        , feedUserMessages (\s -> UserPageMsg <| FeedUserMessages s)
        , receiveNewRoomInfo ReceiveNewSessionId
        , hashChanged HashChanged
        , feedRoomInfo FeedRoomInfo
        , feedSessionsWithSameMembers (\s -> NewSessionMsg (FeedSessionsWithSameMembers s))
        , feedSessionsOf (\s -> UserPageMsg (FeedSessions s))
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


showAll : List ChatEntry -> Dict String Bool
showAll messages =
    Dict.fromList <| List.map (\m -> ( m, True )) (getMembers messages)


type alias Flags =
    { username : String }
