port module Navigation exposing (enterHome, enterNewSession, enterNewWorkspace, enterProfileEdit, enterSession, enterSessionList, enterUser, enterUserList, enterUserProfile, enterUserSetting, enterWorkspace, enterWorkspaceEdit, enterWorkspaceList, loadingView, notFound, notFoundView, pageToPath, pathToPage, updatePageHash)

import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


pageToPath : Page -> String
pageToPath page =
    case page of
        RoomPage r ->
            "/sessions/" ++ r

        SessionListPage ->
            "/sessions"

        UserPage u ->
            "/users/" ++ u

        UserListPage ->
            "/users"

        WorkspacePage id ->
            "/workspaces/" ++ id

        WorkspaceListPage ->
            "/workspaces"

        WorkspaceEditPage id ->
            "/workspaces/" ++ id ++ "/edit"

        NewWorkspacePage ->
            "/workspaces/new"

        UserProfilePage u ->
            "/profiles/" ++ u

        ProfileEditPage ->
            "/profiles/edit"

        UserSettingPage ->
            "/settings"

        HomePage ->
            "/"

        NewSession ->
            "/sessions/new"

        NotFound ->
            "/404"


pathToPage : String -> Page
pathToPage hash =
    case Maybe.withDefault [] <| List.tail (String.split "/" hash) of
        "sessions" :: r :: _ ->
            if r == "" then
                SessionListPage

            else if r == "new" then
                NewSession

            else
                RoomPage r

        "sessions" :: _ ->
            SessionListPage

        "users" :: u :: _ ->
            if u == "" then
                UserListPage

            else
                UserPage u

        "users" :: _ ->
            UserListPage

        "profiles" :: u :: _ ->
            if u == "" then
                NotFound

            else if u == "edit" then
                ProfileEditPage

            else
                UserProfilePage u

        "workspaces" :: id :: rest ->
            if id == "" then
                WorkspaceListPage

            else if id == "new" then
                NewWorkspacePage

            else if rest == [ "edit" ] then
                WorkspaceEditPage id

            else
                WorkspacePage id

        "workspaces" :: _ ->
            WorkspaceListPage

        [ "settings" ] ->
            UserSettingPage

        "" :: _ ->
            HomePage

        [] ->
            HomePage

        _ ->
            NotFound


updatePageHash : Model -> Cmd Msg
updatePageHash model =
    setPageHash (pageToPath model.page)


notFoundView : Model -> { title : String, body : List (Html Msg) }
notFoundView _ =
    { title = "Not found"
    , body = [ div [] [ text "Not found" ], div [] [ a [ href "/main#/" ] [ text "ホームに戻る" ] ] ]
    }


loadingView : Model -> { title : String, body : List (Html Msg) }
loadingView model =
    { title = "COI SNS"
    , body = [ div [ id "center-loading" ] [ text "Loading..." ] ]
    }


enterNewSession : Model -> ( Model, Cmd Msg )
enterNewSession model =
    let
        new_model =
            { model | page = NewSession, newSessionModel = { selected = Set.singleton model.myself, sessions_same_members = [] } }
    in
    ( new_model, updatePageHash new_model )


enterWorkspaceList : Model -> ( Model, Cmd Msg )
enterWorkspaceList model =
    let
        new_model =
            { model | page = WorkspaceListPage }
    in
    ( new_model, updatePageHash new_model )


enterWorkspace : Model -> String -> ( Model, Cmd Msg )
enterWorkspace model wid =
    let
        workspaceModel =
            model.workspaceModel

        new_model =
            { model | page = WorkspacePage wid, workspaceModel = { workspaceModel | selectedMembers = Set.empty } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getWorkspace wid, getSessionsInWorkspace wid ] )


enterWorkspaceEdit : Model -> String -> ( Model, Cmd Msg )
enterWorkspaceEdit model wid =
    let
        ws_m =
            Dict.get wid model.workspaces

        workspaceEditModel =
            model.workspaceEditModel
    in
    case ws_m of
        Just ws ->
            if ws.owner == model.myself then
                let
                    new_model =
                        { model | page = WorkspaceEditPage wid, workspaceEditModel = { workspaceEditModel | name = ws.name } }
                in
                ( new_model, Cmd.batch [ updatePageHash new_model, getSessionsInWorkspace wid ] )

            else
                ( model, Cmd.none )

        Nothing ->
            ( model, Cmd.none )


enterNewWorkspace : Model -> ( Model, Cmd Msg )
enterNewWorkspace model =
    let
        new_model =
            { model | page = NewWorkspacePage, newWorkspaceModel = { selected = Set.singleton model.myself } }
    in
    ( new_model, updatePageHash new_model )


notFound : Model -> ( Model, Cmd Msg )
notFound model =
    ( { model | page = NotFound }, Cmd.none )


enterHome : Model -> ( Model, Cmd Msg )
enterHome model =
    ( { model | page = HomePage }, Cmd.none )


enterUserList : Model -> ( Model, Cmd Msg )
enterUserList model =
    ( { model | page = UserListPage }, Cmd.none )


enterProfileEdit : Model -> ( Model, Cmd Msg )
enterProfileEdit model =
    let
        upm =
            model.userPageModel

        sdgs =
            Maybe.withDefault Set.empty <| Maybe.map getSDGs (getUserInfo model model.myself)
    in
    ( { model | page = ProfileEditPage, userPageModel = { upm | selectedSDGs = sdgs } }, Cmd.none )


enterSessionList : Model -> ( Model, Cmd Msg )
enterSessionList model =
    ( { model | page = SessionListPage }, Cmd.none )


enterUserSetting : Model -> ( Model, Cmd Msg )
enterUserSetting model =
    let
        new_model =
            { model | page = UserSettingPage }
    in
    ( new_model, getConfig () )


enterSession : String -> Model -> ( Model, Cmd Msg )
enterSession r model =
    let
        users =
            []

        chatPageStatus =
            model.chatPageStatus

        new_model =
            { model | page = RoomPage r, chatPageStatus = { chatPageStatus | filterMode = Person, filter = Set.fromList users, users = users, messages = Nothing } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getMessages r, joinRoom { session_id = r, user_id = model.myself }, getCurrentSessionInfo r ] )


enterUser : String -> Model -> ( Model, Cmd Msg )
enterUser u model =
    let
        new_model =
            { model | page = UserPage u, userPageModel = { sessions = [], messages = [], shownFileID = Nothing, newFileBox = False, selectedSDGs = Set.empty } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getSessionsOf u, getUserMessages u ] )


enterUserProfile : String -> Model -> ( Model, Cmd Msg )
enterUserProfile u model =
    let
        m_user =
            getUserInfo model u

        upm =
            model.userPageModel

        new_model =
            { model | page = UserProfilePage u, userPageModel = { upm | selectedSDGs = Maybe.withDefault Set.empty <| Maybe.map getSDGs m_user } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model ] )
