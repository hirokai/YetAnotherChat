module Components exposing (iconOfUser, leftMenu, makeLinkToOriginal, mkPeoplePanel, mkWorkspacePanel, onKeyDown, ourFormatter, sdgIcon, showChannels, showSource, showVisibility, smallMenu, topPane, updateRoomName)

import DateFormat
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Navigation exposing (..)
import Ports exposing (..)
import Set
import Time exposing (Zone)
import Types exposing (..)



-- https://avatars.discourse.org/v4/letter/t/cc2283/60.png


iconOfUser : User -> String
iconOfUser user =
    user.avatar


sdgIcon : Int -> String
sdgIcon i =
    "/public/img/SDGs/sdg_icon_"
        ++ (if i < 10 then
                "0"

            else
                ""
           )
        ++ String.fromInt i
        ++ "_ja.png"


showSource : String -> Html Msg
showSource s =
    case s of
        "email" ->
            text "Email"

        "self" ->
            text "self"

        s1 ->
            if String.left 14 s1 == "slack:channel:" then
                text "Slack"

            else
                text "(unknown)"


makeLinkToOriginal : CommentTyp -> String
makeLinkToOriginal c =
    case c.source of
        "email" ->
            "/email/" ++ c.originalUrl

        "self" ->
            "/comments/" ++ c.id

        _ ->
            c.originalUrl


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

        roomId =
            Maybe.withDefault "" <| getRoomID model
    in
    if not model.localConfig.show_toppane then
        text ""

    else
        div [ class "row" ]
            [ smallMenu
            , div
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
                        button [ id "top-pane-expand-button", class "btn btn-sm btn-light", onClick (SessionMsg <| ExpandTopPane False) ] [ i [ class "material-icons" ] [ text "expand_more" ] ]

                      else
                        button [ id "top-pane-expand-button", class "btn btn-sm btn-light", onClick (SessionMsg <| ExpandTopPane True) ] [ i [ class "material-icons" ] [ text "chevron_right" ] ]
                    , span [ class "top-page-menu-label" ] [ text "フィルタ" ]
                    , button [ klass Thread, onClick (SessionMsg <| SetFilterMode Thread) ] [ text "スレッド" ]
                    , button [ klass Person, onClick (SessionMsg <| SetFilterMode Person) ] [ text "人" ]
                    , button [ klass Date, onClick (SessionMsg <| SetFilterMode Date) ] [ text "日付" ]
                    , span [ id "toppane-subject", class "hidden" ] [ text (roomName roomId model) ]
                    , div [ id "topright-buttons" ]
                        [ button [ class "btn btn-sm btn-light", onClick (SessionMsg <| SmallerFont) ] [ span [ class "smaller-font-btn" ] [ text "A" ] ]
                        , button [ class "btn btn-sm btn-light", onClick (SessionMsg <| LargerFont) ] [ span [ class "bigger-font-btn" ] [ text "A" ] ]
                        ]
                    ]
                , if model.chatPageStatus.topPaneExpanded then
                    case model.chatPageStatus.filterMode of
                        Thread ->
                            div [ id "top-pane-list-container" ]
                                [ ul [] <| List.map (\r -> li [] [ input [ type_ "checkbox" ] [], span [] [ text (roomName r model) ] ]) (Dict.keys model.sessions)
                                ]

                        Date ->
                            div [] []

                        Person ->
                            div [ id "top-pane-list-container" ]
                                [ ul [] <| List.map (\u -> li [] [ input [ type_ "checkbox", checked (Set.member u model.chatPageStatus.filter), onCheck (\b -> SessionMsg <| SetFilter u b) ] [], span [] [ text (getUserName model u) ] ]) model.chatPageStatus.users
                                ]

                  else
                    text ""
                ]
            ]


smallMenu : Html Msg
smallMenu =
    div [ id "smallmenu", class "d-block d-md-none" ]
        [ a [ class "clickable smallmenu-item", href "#/workspaces/" ] [ text "ワークスペース" ]
        , a [ class "clickable smallmenu-item", href "#/sessions/" ] [ text "セッション" ]
        , a [ class "clickable smallmenu-item", href "#/users/" ] [ text "ユーザー" ]
        , a [ class "clickable smallmenu-item right", onClick Logout ] [ text "ログアウト" ]
        , a [ class "clickable smallmenu-item right", href "#/settings" ] [ text "設定" ]
        ]


updateRoomName : SessionID -> String -> Model -> Model
updateRoomName room newName model =
    let
        f _ v =
            if v.id == room then
                { v | name = newName }

            else
                v
    in
    { model | sessions = Dict.map f model.sessions }


onKeyDown : ({ code : Int, shiftKey : Bool } -> msg) -> Attribute msg
onKeyDown tagger =
    let
        decoder =
            Json.map2 (\code shift -> { code = code, shiftKey = shift })
                (Json.field "keyCode" Json.int)
                (Json.field "shiftKey" Json.bool)
    in
    on "keydown" (Json.map tagger decoder)


leftMenu : Model -> Html Msg
leftMenu model =
    div [ class "d-none d-md-block col-md-5 col-lg-2", id "menu-left-wrapper" ]
        [ div [ id "menu-left" ]
            ([ div [ id "username-top" ]
                [ a [ href "#/" ] [ text "🏠" ]
                , a [ id "lefttop-myself-name", href <| "#/profiles/" ++ model.myself ] [ text (getUserName model model.myself) ]
                , a [ onClick Logout, class "clickable", id "logout-button" ] [ text "ログアウト" ]
                , a [ id "config-button", href "#/settings" ] [ text "⚙" ]
                ]
             , div [ id "path" ] [ text (pageToPath model.page) ]
             , div [ id "list-btns" ]
                [ a [ id "btn-workspacelist", class "btn btn-light btn-sm", href "#/workspaces/" ] [ text "ワークスペース" ]
                , a [ id "btn-sessionlist", class "btn btn-light btn-sm", href "#/sessions/" ] [ text "セッション" ]
                , a [ id "btn-userlist", class "btn btn-light btn-sm", href "#/users/" ] [ text "ユーザー" ]
                ]
             ]
                ++ (case model.page of
                        UserPage _ ->
                            showUsers model

                        UserListPage ->
                            showUsers model

                        WorkspacePage _ ->
                            showWorkspaces model

                        WorkspaceListPage ->
                            showWorkspaces model

                        WorkspaceEditPage _ ->
                            showWorkspaces model

                        _ ->
                            showChannels model
                   )
            )
        ]


showWorkspaces : Model -> List (Html Msg)
showWorkspaces model =
    [ div [] [ text "ワークスペース一覧" ]
    , ul [ class "menu-list" ] <|
        List.indexedMap
            (\i w ->
                li []
                    [ hr [] []
                    , div
                        [ classList [ ( "chatlist-name", True ), ( "clickable", True ), ( "current", WorkspacePage w.id == model.page || WorkspaceEditPage w.id == model.page ) ]
                        ]
                        [ a [ href <| "#/workspaces/" ++ w.id ] [ text <| String.fromInt (i + 1) ++ ": " ++ w.name ++ " (" ++ (String.fromInt <| List.length w.members) ++ ")" ]
                        ]
                    ]
            )
            (List.sortBy (\w -> 0 - List.length w.members) (Dict.values model.workspaces))
    ]


showChannels : Model -> List (Html Msg)
showChannels model =
    [ div [] [ text "セッション一覧" ]
    , ul [ class "menu-list" ] <|
        let
            sessions_sorted =
                List.reverse <| List.sortBy (\s -> sessionLastUpdated s) (Dict.values model.sessions)
        in
        List.indexedMap
            (\i session ->
                li []
                    [ hr [] []
                    , div
                        [ classList [ ( "chatlist-name", True ), ( "clickable", True ), ( "current", RoomPage session.id == model.page ) ]
                        ]
                        [ a [ href <| "#/sessions/" ++ session.id ] [ text <| String.fromInt (i + 1) ++ ": " ++ session.name ++ " (" ++ (Maybe.withDefault "-" <| Maybe.map String.fromInt <| Dict.get "__total" <| session.numMessages) ++ ")" ]
                        , div [ class "chatlist-members" ]
                            (List.intersperse (text ",") <|
                                List.map (\u -> a [ class "chatlist-member clickable", href <| "#/users/" ++ u ] [ text (getUserName model u) ]) <|
                                    session.members
                            )
                        ]
                    ]
            )
            sessions_sorted
    ]


showUsers : Model -> List (Html Msg)
showUsers model =
    [ div [] [ text "ユーザー一覧" ]
    , ul [ class "menu-list" ] <|
        List.indexedMap
            (\i u ->
                li []
                    [ hr [] []
                    , div
                        [ classList [ ( "chatlist-name", True ), ( "clickable", True ), ( "current", UserPage u.id == model.page ) ]
                        ]
                        [ a [ href <| "#/users/" ++ u.id ] [ text <| String.fromInt (i + 1) ++ ": " ++ getUserNameDisplay model u.id ]
                        ]
                    ]
            )
            (Dict.values model.users)
    ]


mkWorkspacePanel : Model -> Workspace -> Html Msg
mkWorkspacePanel model ws =
    let
        text_too_long =
            List.sum (List.map (\m -> String.length <| getUserName model m) ws.members) >= 50
    in
    div
        [ classList [ ( "ws-list-item", True ) ]
        ]
        [ div []
            [ div [ class "name" ]
                [ a [ class "clickable", href <| "#/workspaces/" ++ ws.id ]
                    [ text ws.name
                    ]
                ]
            , div [ class "ws-panel-member" ]
                (if text_too_long then
                    [ text <| String.fromInt (List.length ws.members) ++ "人の参加者" ]

                 else
                    List.intersperse (text ", ") <| List.map (\n -> a [ class "clickable", href <| "#/users/" ++ n ] [ text (getUserName model n) ]) ws.members
                )
            ]
        ]


mkPeoplePanel : Model -> Set.Set String -> String -> Html Msg
mkPeoplePanel model selected user =
    let
        email =
            Maybe.withDefault "" <| Maybe.andThen (.emails >> List.head) (getUserInfo model user)
    in
    div
        [ classList [ ( "person-panel", True ), ( "active", Set.member user selected || user == model.myself ) ]
        , if user == model.myself then
            attribute "_" "_"

          else
            onClick (NewSessionMsg (TogglePersonInNew user))
        ]
        [ div [ class "name" ] [ text (getUserNameDisplay model user) ], div [ class "email" ] [ text email ] ]


ourFormatter : Zone -> Int -> String
ourFormatter zone t =
    DateFormat.format
        [ DateFormat.yearNumber
        , DateFormat.text "/"
        , DateFormat.monthNumber
        , DateFormat.text "/"
        , DateFormat.dayOfMonthNumber
        , DateFormat.text " "
        , DateFormat.hourMilitaryNumber
        , DateFormat.text ":"
        , DateFormat.minuteFixed
        ]
        zone
        (Time.millisToPosix t)


showVisibility : String -> String
showVisibility s =
    case s of
        "public" ->
            "公開"

        "workspace" ->
            "ワークスペース内の一覧に表示"

        "url" ->
            "URL共有で参加"

        "private" ->
            "招待メンバーのみ"

        _ ->
            "N/A"
