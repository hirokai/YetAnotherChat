module Main exposing (Flags, finishEditing, init, main, subscriptions, update, view)

import Browser
import Decoders exposing (..)
import Dict
import HomeView exposing (..)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Maybe.Extra exposing (..)
import Navigation exposing (..)
import NewSessionView exposing (..)
import Ports exposing (..)
import ProfileView exposing (..)
import Regex exposing (..)
import SessionListView exposing (..)
import SessionView exposing (..)
import Set
import SettingsView exposing (..)
import Task
import Time exposing (utc)
import Types exposing (..)
import UserListView exposing (..)
import UserPageView exposing (..)


init : Flags -> ( Model, Cmd Msg )
init { user_id, show_toppane, expand_chatinput, show_users_with_email_only } =
    ( { myself = user_id
      , roomInfo = Dict.empty
      , rooms = [ "Home", "COI" ]
      , page = NewSession
      , users = Dict.empty
      , selected = Set.empty
      , newSessionStatus = { selected = Set.empty, sessions_same_members = [] }
      , userPageModel = { sessions = [], messages = [], shownFileID = Nothing, newFileBox = False, selectedSDGs = Set.empty }
      , chatPageStatus = initialChatPageStatus show_toppane expand_chatinput
      , userListPageModel = initialUserListPageModel show_users_with_email_only
      , settingsPageModel = initialSettingsPageModel
      , editing = Set.empty
      , editingValue = Dict.empty
      , files = Dict.empty
      , timezone = utc
      , searchKeyword = ""
      , profile = { publicKey = "", privateKey = "", privateKeyMsg = "" }
      }
    , Cmd.batch [ initializeData (), Task.perform SetTimeZone Time.here ]
    )


main : Program Flags Model Msg
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        ToggleMember m ->
            ( { model | selected = toggleSet m model.selected }, Cmd.none )

        ReloadSessions ->
            ( model, reloadSessions () )

        FeedUsers users ->
            ( { model | users = Dict.fromList <| List.map (\u -> ( u.id, u )) users }, Cmd.none )

        FeedRoomInfo v ->
            let
                rs1 =
                    Json.decodeValue roomInfoListDecoder v
            in
            case rs1 of
                Ok rs ->
                    ( { model | roomInfo = Dict.fromList (List.map (\r -> ( r.id, r )) rs), rooms = List.map (\r -> r.id) rs }, Cmd.none )

                Err _ ->
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
                    updateUserPageModel msg1 model.userPageModel
            in
            ( { model | userPageModel = m }, c )

        UserListPageMsg msg1 ->
            let
                ( m, c ) =
                    updateUserListPageModel msg1 model.userListPageModel
            in
            ( { model | userListPageModel = m }, c )

        ChatPageMsg msg1 ->
            let
                ( m, c ) =
                    updateChatPageStatus msg1 model.chatPageStatus
            in
            ( { model | chatPageStatus = m }, c )

        SettingsMsg msg1 ->
            let
                ( m, c ) =
                    updateSettingsPageStatus msg1 model.settingsPageModel
            in
            ( { model | settingsPageModel = m }, c )

        StartSession users ->
            let
                user_list =
                    Set.toList users
            in
            ( { model | page = RoomPage "" }, Cmd.batch [ createNewSession ( "", user_list ), updatePageHash model ] )

        ReceiveNewSessionId { id } ->
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
            let
                nev =
                    if model.chatPageStatus.chatInputActive then
                        Dict.insert id newValue model.editingValue

                    else
                        model.editingValue
            in
            ( { model | editingValue = nev }, Cmd.none )

        EditingKeyDown id updateFunc updatePort { code, shiftKey } ->
            if code == 13 then
                if shiftKey then
                    finishEditing id updateFunc updatePort model

                else
                    ( model, Cmd.none )

            else
                ( model, Cmd.none )

        SetTimeZone zone ->
            ( { model | timezone = zone }, Cmd.none )

        SetPageHash ->
            ( model, setPageHash (pageToPath model.page) )

        HashChanged hash ->
            if hash /= pageToPath model.page then
                case pathToPage hash of
                    UserPage u ->
                        enterUser u model

                    UserProfilePage u ->
                        enterUserProfile u model

                    UserListPage ->
                        enterUserList model

                    UserSettingPage ->
                        enterUserSetting model

                    RoomPage r ->
                        enterRoom r model

                    SessionListPage ->
                        enterSessionList model

                    HomePage ->
                        enterHome model

                    NewSession ->
                        enterNewSession model

                    NotFound ->
                        notFound model

            else
                ( model, Cmd.none )

        FeedUserImages { user_id, images } ->
            let
                old_files_empty =
                    List.isEmpty (Maybe.withDefault [] <| Dict.get user_id model.files)

                files =
                    Dict.insert user_id images model.files

                first_file_id =
                    Maybe.map .file_id <| Maybe.andThen List.head <| Dict.get user_id files

                ups =
                    model.userPageModel
            in
            ( { model
                | files = files
                , userPageModel =
                    { ups
                        | shownFileID =
                            if old_files_empty then
                                first_file_id

                            else
                                ups.shownFileID
                    }
              }
            , Cmd.none
            )

        DeleteRoom room ->
            ( { model | rooms = List.filter (\r -> r /= room) model.rooms, page = SessionListPage }, deleteSession { id = room } )

        ReloadRoom room ->
            ( model, reloadSession room )

        StartNewPosterSession file_id ->
            ( model, startPosterSession file_id )

        Logout ->
            ( model, logout () )

        OnChangeData { resource, id, operation } ->
            let
                cmd =
                    if resource == "comments" && getRoomID model == Just id then
                        Cmd.none

                    else if resource == "sessions" then
                        if operation == "delete" then
                            getRoomInfo ()

                        else
                            Cmd.batch [ getRoomInfo (), getMessages id ]

                    else if resource == "users" then
                        getUsers ()

                    else
                        Cmd.none
            in
            ( model, cmd )

        SubmitComment ->
            submitComment model

        SendCommentDone _ ->
            let
                csp =
                    model.chatPageStatus
            in
            ( { model | chatPageStatus = { csp | chatInputActive = True } }, Cmd.none )

        DownloadPrivateKey ->
            ( model, downloadPrivateKey () )

        UploadPrivateKey ->
            ( model, uploadPrivateKey () )

        ResetKeys ->
            ( model, resetKeys () )

        ResetUserCache ->
            ( model, resetUserCache () )

        SetValue k v ->
            case k of
                "my_public_key" ->
                    let
                        profile =
                            model.profile

                        new_profile =
                            { profile | publicKey = v }
                    in
                    ( { model | profile = new_profile }, Cmd.none )

                "my_private_key" ->
                    let
                        profile =
                            model.profile

                        new_profile =
                            { profile | privateKey = v }
                    in
                    if v == "" then
                        enterUserSetting { model | profile = new_profile }

                    else
                        ( { model | profile = new_profile }, Cmd.none )

                "my_private_key_message" ->
                    let
                        profile =
                            model.profile

                        new_profile =
                            { profile | privateKeyMsg = v }
                    in
                    ( { model | profile = new_profile }, Cmd.none )

                _ ->
                    ( model, Cmd.none )

        SearchUser q ->
            ( { model | searchKeyword = q }, Cmd.none )


finishEditing : String -> (Model -> Model) -> Cmd Msg -> Model -> ( Model, Cmd Msg )
finishEditing id updateFunc updatePort model =
    ( updateFunc { model | editing = Set.remove id model.editing, editingValue = Dict.insert id "" model.editingValue }, updatePort )


view : Model -> Browser.Document Msg
view model =
    case model.page of
        NewSession ->
            newSessionView model

        RoomPage room ->
            chatRoomView room model

        SessionListPage ->
            sessionListView model

        UserPage user ->
            userPageView user model

        UserProfilePage u ->
            case getUserInfo model u of
                Just user ->
                    userProfileView user model

                Nothing ->
                    notFoundView model

        UserSettingPage ->
            case getUserInfo model model.myself of
                Just user ->
                    userSettingView user model

                Nothing ->
                    notFoundView model

        UserListPage ->
            userListView model

        HomePage ->
            homeView model

        NotFound ->
            notFoundView model


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch <|
        [ feedUsers FeedUsers
        , feedMessages (\ms -> ChatPageMsg <| FeedMessages (Result.withDefault [] (Json.decodeValue chatEntriesDecoder ms)))
        , feedUserMessages (\ms -> UserPageMsg <| FeedUserMessages (Result.withDefault [] (Json.decodeValue chatEntriesDecoder ms)))
        , receiveNewRoomInfo ReceiveNewSessionId
        , hashChanged HashChanged
        , feedRoomInfo FeedRoomInfo
        , feedSessionsWithSameMembers (\s -> NewSessionMsg (FeedSessionsWithSameMembers s))
        , feedSessionsOf (\s -> UserPageMsg (FeedSessions s))
        , feedUserImages FeedUserImages
        , sendCommentToServerDone SendCommentDone
        , onChangeData OnChangeData
        , setValue (\( k, v ) -> SetValue k v)
        ]
            ++ configSubscriptions
            ++ sessionSubscriptions


type alias Flags =
    { user_id : String
    , show_toppane : Bool
    , expand_chatinput : Bool
    , show_users_with_email_only : Bool
    }
