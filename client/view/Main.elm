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
import Workspace exposing (..)


init : Flags -> ( Model, Cmd Msg )
init { user_id, config } =
    ( { myself = user_id
      , sessions = Dict.empty
      , workspaces = Dict.empty
      , localConfig = config
      , page = NewSession
      , users = Dict.empty
      , newWorkspaceModel = { selected = Set.empty }
      , workspaceModel = { sessions = [], selectedMembers = Set.empty }
      , workspaceListModel = { showMode = Table }
      , workspaceEditModel = { name = "" }
      , newSessionModel = { selected = Set.empty, sessions_same_members = [] }
      , userPageModel = { sessions = [], messages = [], shownFileID = Nothing, newFileBox = False, selectedSDGs = Set.empty }
      , chatPageStatus = initialChatPageStatus config.expand_toppane config.expand_chatinput
      , userListPageModel = initialUserListPageModel config.show_users_with_email_only
      , settingsPageModel = initialSettingsPageModel
      , loaded =
            { workspaces = False
            , workspace = False
            , sessions = False
            , session = False
            , users = False
            , user = False
            }
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

        ReloadSessions ->
            ( model, reloadSessions () )

        FeedWorkspaces ws ->
            let
                loaded =
                    model.loaded
            in
            ( { model | workspaces = Dict.fromList <| List.map (\u -> ( u.id, u )) ws, loaded = { loaded | workspaces = True } }, Cmd.none )

        FeedWorkspace w ->
            let
                loaded =
                    model.loaded
            in
            ( { model | workspaces = Dict.insert w.id w model.workspaces, loaded = { loaded | workspaces = True } }, Cmd.none )

        FeedUsers users ->
            let
                loaded =
                    model.loaded
            in
            ( { model | users = Dict.fromList <| List.map (\u -> ( u.id, u )) users, loaded = { loaded | users = True } }, Cmd.none )

        FeedRoomInfo v ->
            let
                rs1 =
                    Json.decodeValue sessionInfoListDecoder v

                loaded =
                    model.loaded
            in
            case rs1 of
                Ok rs ->
                    ( { model | sessions = Dict.fromList (List.map (\r -> ( r.id, r )) rs), loaded = { loaded | sessions = True } }, Cmd.none )

                Err _ ->
                    ( model, Cmd.none )

        FeedNewRoomInfo v ->
            case Json.decodeValue sessionInfoDecoder v of
                Ok rs ->
                    let
                        loaded =
                            model.loaded

                        new_model : Model
                        new_model =
                            { model | sessions = Dict.insert rs.id rs model.sessions, loaded = { loaded | session = True } }
                    in
                    ( new_model, Cmd.none )

                Err _ ->
                    ( model, Cmd.none )

        EnterRoom r ->
            if model.page /= RoomPage r then
                enterSession r model

            else
                ( model, Cmd.none )

        EnterUser u ->
            enterUser u model

        NewWorkspaceMsg msg1 ->
            let
                ( m, c ) =
                    updateNewWorkspaceModel msg1 model.newWorkspaceModel

                new_model : Model
                new_model =
                    { model | newWorkspaceModel = m }
            in
            ( new_model, c )

        WorkspaceMsg msg1 ->
            case model.page of
                WorkspacePage ws ->
                    let
                        ( m, c ) =
                            updateWorkspaceModel ws msg1 model.workspaceModel
                    in
                    ( { model | workspaceModel = m }, c )

                _ ->
                    ( model, Cmd.none )

        WorkspaceEditMsg msg1 ->
            case model.page of
                WorkspaceEditPage ws ->
                    let
                        ( m, c ) =
                            updateWorkspaceEditModel ws msg1 model.workspaceEditModel
                    in
                    ( { model | workspaceEditModel = m }, c )

                _ ->
                    ( model, Cmd.none )

        WorkspaceListMsg msg1 ->
            case model.page of
                WorkspaceListPage ->
                    let
                        ( m, c ) =
                            updateWorkspaceListModel msg1 model.workspaceListModel
                    in
                    ( { model | workspaceListModel = m }, c )

                _ ->
                    ( model, Cmd.none )

        NewSessionMsg msg1 ->
            let
                ( m, c ) =
                    updateNewSessionStatus msg1 model.newSessionModel
            in
            ( { model | newSessionModel = m }, c )

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

        SessionMsg msg1 ->
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
            ( { model | page = RoomPage "" }, Cmd.batch [ createSession { name = "", members = user_list, workspace = "", redirect = True }, updatePageHash model ] )

        ReceiveNewSessionId { id } ->
            enterSession id model

        EnterNewSessionScreen ->
            enterNewSession model

        CreateWorkspace members ->
            ( model, createWorkspace ( "WS" ++ String.fromInt (Dict.size model.workspaces + 1), Set.toList members ) )

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

        EditingKeyDown id updateFunc updatePort shifted { code, shiftKey } ->
            if code == 13 then
                if (shifted && shiftKey) || (not shifted && not shiftKey) then
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

                    ProfileEditPage ->
                        enterProfileEdit model

                    UserListPage ->
                        enterUserList model

                    UserSettingPage ->
                        enterUserSetting model

                    WorkspaceListPage ->
                        enterWorkspaceList model

                    WorkspacePage id ->
                        enterWorkspace model id

                    WorkspaceEditPage id ->
                        enterWorkspaceEdit model id

                    NewWorkspacePage ->
                        enterNewWorkspace model

                    RoomPage r ->
                        enterSession r model

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
            ( { model | page = SessionListPage }, deleteSession { id = room } )

        ReloadRoom room ->
            ( model, reloadSession room )

        SetVisibility kind id v ->
            ( model, setVisibility { kind = kind, id = id, visibility = v } )

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

        DeleteWorkspace ws ->
            let
                ( m, c ) =
                    enterWorkspaceList model
            in
            ( m, Cmd.batch [ c, deleteWorkspace ws ] )

        JoinWorkspace ws ->
            ( model, joinWorkspace ws )

        QuitWorkspace ws ->
            let
                ( m, c ) =
                    enterWorkspaceList model
            in
            ( m, Cmd.batch [ c, quitWorkspace ws ] )

        SaveConfigLocal k v ->
            let
                new_config =
                    case k of
                        "email_workspace" ->
                            let
                                config =
                                    model.localConfig
                            in
                            { config
                                | email_workspace =
                                    if v /= "__none__" then
                                        Just v

                                    else
                                        Nothing
                            }

                        _ ->
                            model.localConfig
            in
            ( { model | localConfig = new_config }, setConfigLocal { key = k, value = "\"" ++ v ++ "\"" } )

        SaveConfigLocalBool k v ->
            let
                s =
                    if v then
                        "true"

                    else
                        "false"

                new_config =
                    case k of
                        "show_toppane" ->
                            let
                                config =
                                    model.localConfig
                            in
                            { config | show_toppane = v }

                        _ ->
                            model.localConfig
            in
            ( { model | localConfig = new_config }, setConfigLocal { key = k, value = s } )


finishEditing : String -> (Model -> Model) -> Cmd Msg -> Model -> ( Model, Cmd Msg )
finishEditing id updateFunc updatePort model =
    ( updateFunc { model | editing = Set.remove id model.editing, editingValue = Dict.insert id "" model.editingValue }, updatePort )


view : Model -> Browser.Document Msg
view model =
    case model.page of
        NewSession ->
            newSessionView model

        RoomPage r ->
            case Dict.get r model.sessions of
                Just room ->
                    chatRoomView room model

                Nothing ->
                    if not model.loaded.session then
                        sessionViewLoading r model

                    else
                        notFoundView model

        SessionListPage ->
            sessionListView model

        UserPage uid ->
            case ( model.loaded.users, Dict.get uid model.users ) of
                ( _, Just user ) ->
                    userPageView user model

                ( True, Nothing ) ->
                    notFoundView model

                ( False, Nothing ) ->
                    loadingView model

        UserProfilePage u ->
            case getUserInfo model u of
                Just user ->
                    userProfileView user model

                Nothing ->
                    notFoundView model

        WorkspaceListPage ->
            workspaceListView model

        WorkspacePage id ->
            case ( model.loaded.workspaces, Dict.get id model.workspaces ) of
                ( _, Just ws ) ->
                    workspaceView model ws

                ( True, Nothing ) ->
                    notFoundView model

                ( False, Nothing ) ->
                    loadingView model

        WorkspaceEditPage id ->
            case Dict.get id model.workspaces of
                Just ws ->
                    workspaceEditView model ws

                Nothing ->
                    notFoundView model

        NewWorkspacePage ->
            newWorkspaceView model

        ProfileEditPage ->
            profileEditView model

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
        , feedWorkspaces FeedWorkspaces
        , feedWorkspace FeedWorkspace
        , feedMessages (\ms -> SessionMsg <| FeedMessages (Result.withDefault [] (Json.decodeValue chatEntriesDecoder ms)))
        , feedUserMessages (\ms -> UserPageMsg <| FeedUserMessages (Result.withDefault [] (Json.decodeValue chatEntriesDecoder ms)))
        , receiveNewRoomInfo ReceiveNewSessionId
        , hashChanged HashChanged
        , feedRoomInfo FeedRoomInfo
        , feedNewRoomInfo FeedNewRoomInfo
        , feedSessionsWithSameMembers (\s -> NewSessionMsg (FeedSessionsWithSameMembers s))
        , feedSessionsOf (\s -> UserPageMsg (FeedSessions s))
        , feedUserImages FeedUserImages
        , sendCommentToServerDone SendCommentDone
        , onChangeData OnChangeData
        , setValue (\( k, v ) -> SetValue k v)
        , feedSessionsInWorkspace (\s -> WorkspaceMsg (FeedSessionsInWorkspace s))
        ]
            ++ configSubscriptions
            ++ sessionSubscriptions


type alias Flags =
    { user_id : String
    , config : LocalConfig
    }
