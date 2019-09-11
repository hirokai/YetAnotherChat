module Components exposing (iconOfUser, leftMenu, makeLinkToOriginal, mkPeoplePanel, onKeyDown, ourFormatter, sdgIcon, showChannels, showSource, smallMenu, topPane, updateRoomName)

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
                    button [ id "top-pane-expand-button", class "btn btn-sm btn-light", onClick (ChatPageMsg <| ExpandTopPane False) ] [ i [ class "material-icons" ] [ text "expand_more" ] ]

                  else
                    button [ id "top-pane-expand-button", class "btn btn-sm btn-light", onClick (ChatPageMsg <| ExpandTopPane True) ] [ i [ class "material-icons" ] [ text "chevron_right" ] ]
                , span [ class "top-page-menu-label" ] [ text "フィルタ" ]
                , button [ klass Thread, onClick (ChatPageMsg <| SetFilterMode Thread) ] [ text "スレッド" ]
                , button [ klass Person, onClick (ChatPageMsg <| SetFilterMode Person) ] [ text "人" ]
                , button [ klass Date, onClick (ChatPageMsg <| SetFilterMode Date) ] [ text "日付" ]
                , span [ id "toppane-subject", class "hidden" ] [ text (roomName roomId model) ]
                , div [ id "topright-buttons" ]
                    [ button [ class "btn btn-sm btn-light", onClick (ChatPageMsg <| SmallerFont) ] [ span [ class "smaller-font-btn" ] [ text "A" ] ]
                    , button [ class "btn btn-sm btn-light", onClick (ChatPageMsg <| LargerFont) ] [ span [ class "bigger-font-btn" ] [ text "A" ] ]
                    ]
                ]
            , if model.chatPageStatus.topPaneExpanded then
                case model.chatPageStatus.filterMode of
                    Thread ->
                        div [ id "top-pane-list-container" ]
                            [ ul [] <| List.map (\r -> li [] [ input [ type_ "checkbox" ] [], span [] [ text (roomName r model) ] ]) model.rooms
                            ]

                    Date ->
                        div [] []

                    Person ->
                        div [ id "top-pane-list-container" ]
                            [ ul [] <| List.map (\u -> li [] [ input [ type_ "checkbox", checked (Set.member u model.chatPageStatus.filter), onCheck (\b -> ChatPageMsg <| SetFilter u b) ] [], span [] [ text (getUserName model u) ] ]) model.chatPageStatus.users
                            ]

              else
                text ""
            ]
        ]


smallMenu : Html Msg
smallMenu =
    div [ id "smallmenu", class "d-block d-md-none" ]
        [ a [ class "clickable smallmenu-item", href "#/users/" ] [ text "ユーザー" ]
        , a [ class "clickable smallmenu-item", href "#/sessions/" ] [ text "セッション" ]
        , a [ class "clickable smallmenu-item", href "#/sessions/new" ] [ text "新しい会話" ]
        , a [ class "clickable smallmenu-item right", onClick Logout ] [ text "ログアウト" ]
        , a [ class "clickable smallmenu-item right", href "#/settings" ] [ text "設定" ]
        ]


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
             , div []
                [ a [ class "btn btn-light", id "newroom-button", onClick EnterNewSessionScreen ] [ text "新しい会話" ]
                ]
             , div [] [ a [ id "btn-userlist", class "btn btn-light btn-sm", href "#/users/" ] [ text "ユーザー" ], a [ id "btn-sessionlist", class "btn btn-light btn-sm", href "#/sessions/" ] [ text "セッション" ] ]
             ]
                ++ (case model.page of
                        UserPage _ ->
                            showUsers model

                        UserListPage ->
                            showUsers model

                        _ ->
                            showChannels model
                   )
            )
        ]


showChannels : Model -> List (Html Msg)
showChannels model =
    [ div [] [ text "セッション一覧" ]
    , ul [ class "menu-list" ] <|
        List.indexedMap
            (\i r ->
                case Dict.get r model.roomInfo of
                    Just roomInfo ->
                        li []
                            [ hr [] []
                            , div
                                [ classList [ ( "chatlist-name", True ), ( "clickable", True ), ( "current", RoomPage r == model.page ) ]
                                ]
                                [ a [ href <| "#/sessions/" ++ r ] [ text <| String.fromInt (i + 1) ++ ": " ++ roomName r model ++ " (" ++ (String.fromInt <| Maybe.withDefault 0 <| Dict.get "__total" <| roomInfo.numMessages) ++ ")" ]
                                , div [ class "chatlist-members" ]
                                    (List.intersperse (text ",") <|
                                        List.map (\u -> a [ class "chatlist-member clickable", href <| "#/users/" ++ u ] [ text (getUserName model u) ]) <|
                                            roomUsers r model
                                    )
                                ]
                            ]

                    Nothing ->
                        li []
                            [ hr [] []
                            , div
                                []
                                [ text "N/A" ]
                            ]
            )
            model.rooms
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
