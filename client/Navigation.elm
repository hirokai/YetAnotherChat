module Navigation exposing (enterHome, enterNewSession, enterRoom, enterSessionList, enterUser, enterUserList, enterUserProfile, enterUserSetting, notFound, notFoundView, pageToPath, pathToPage, updatePageHash)

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
            "/sessions/"

        UserPage u ->
            "/users/" ++ u

        UserProfilePage u ->
            "/profiles/" ++ u

        UserSettingPage ->
            "/settings"

        UserListPage ->
            "/users/"

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

        "users" :: u :: _ ->
            if u == "" then
                UserListPage

            else
                UserPage u

        "profiles" :: u :: _ ->
            if u == "" then
                NotFound

            else
                UserProfilePage u

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


enterNewSession : Model -> ( Model, Cmd Msg )
enterNewSession model =
    let
        new_model =
            { model | page = NewSession, newSessionStatus = { selected = Set.singleton model.myself, sessions_same_members = [] } }
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


enterSessionList : Model -> ( Model, Cmd Msg )
enterSessionList model =
    ( { model | page = SessionListPage }, Cmd.none )


enterUserSetting : Model -> ( Model, Cmd Msg )
enterUserSetting model =
    let
        new_model =
            { model | page = UserSettingPage }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model ] )


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
    ( new_model, Cmd.batch [ updatePageHash new_model, getMessages r, joinRoom { session_id = r, user_id = model.myself }, enterSession r ] )


enterUser : String -> Model -> ( Model, Cmd Msg )
enterUser u model =
    let
        new_model =
            { model | page = UserPage u, userPageStatus = { sessions = [], messages = [], shownFileID = Nothing, newFileBox = False } }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model, getSessionsOf u, getUserMessages u ] )


enterUserProfile : String -> Model -> ( Model, Cmd Msg )
enterUserProfile u model =
    let
        new_model =
            { model | page = UserProfilePage u }
    in
    ( new_model, Cmd.batch [ updatePageHash new_model ] )
