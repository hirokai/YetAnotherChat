module UserListView exposing (initialUserListPageModel, mkPeopleDivInList, updateUserListPageModel, userListView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


userListView : Model -> { title : String, body : List (Html Msg) }
userListView model =
    let
        filterWithEmailExists : User -> Bool
        filterWithEmailExists u =
            Just "" /= List.head u.emails

        filterWithName : User -> Bool
        filterWithName u =
            if model.searchKeyword == "" then
                True

            else
                let
                    kw =
                        String.toLower model.searchKeyword
                in
                String.contains kw (String.toLower u.fullname) || String.contains kw (String.toLower u.username) || String.contains kw (String.toLower <| String.join "," u.emails)

        userFilter : User -> Bool
        userFilter =
            if model.userListPageModel.userWithIdOnly then
                \u -> filterWithEmailExists u && filterWithName u

            else
                filterWithName

        filteredUsers : List User
        filteredUsers =
            List.filter userFilter <|
                List.map Tuple.second <|
                    Dict.toList
                        model.users
    in
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "ユーザー一覧" ]
                    , div [ class "btn-group" ] [ input [ type_ "input", id "search-user", class "form-control", onInput SearchUser, value model.searchKeyword, placeholder "検索", autocomplete False ] [], i [ class "searchclear far fa-times-circle", onClick (SearchUser "") ] [], button [ class "btn btn-light", id "reset-user-cache", onClick ResetUserCache ] [ text "Reload" ] ]
                    , div [] [ input [ type_ "checkbox", id "check-user-with-id-only", checked model.userListPageModel.userWithIdOnly, onCheck (CheckUserWithIdOnly >> UserListPageMsg) ] [], label [ for "check-user-with-id-only" ] [ text "メールアドレスの無いユーザーを隠す" ] ]
                    , div []
                        [ span [] [ text "表示" ]
                        , button [ class "btn btn-sm btn-light", onClick (UserListPageMsg <| ChangeShowMode Table) ] [ text "テーブル" ]
                        , button [ class "btn btn-sm btn-light", onClick (UserListPageMsg <| ChangeShowMode Panel) ] [ text "パネル" ]
                        ]
                    , if model.userListPageModel.showMode == Table then
                        showTable model filteredUsers

                      else
                        showPanels model filteredUsers
                    ]
                ]
            ]
        ]
    }


showTable : Model -> List User -> Html Msg
showTable model users =
    let
        showItem : User -> Html Msg
        showItem user =
            let
                profileDict =
                    Dict.fromList user.profile

                sdgs : Set.Set Int
                sdgs =
                    getSDGs user

                sdgIcons =
                    List.map (\n -> img [ src (sdgIcon n), classList [ ( "hidden", not (Set.member n sdgs) ) ] ] []) (List.range 1 10)
                        ++ [ br [] [] ]
                        ++ List.map (\n -> img [ src (sdgIcon n), classList [ ( "hidden", not (Set.member n sdgs) ) ] ] []) (List.range 11 17)
            in
            tr []
                [ td [] [ img [ class "table-user-icon", src user.avatar ] [] ]
                , td [] [ text user.username ]
                , td [] [ text user.fullname ]
                , td [] [ text <| Maybe.withDefault "" <| List.head user.emails ]
                , td [ class "fingerprint" ] [ div [] [ text user.fingerprint ] ]
                , td [ class "userlist-SDGs" ] sdgIcons
                ]
    in
    div []
        [ table [ class "table", id "userlist-table" ]
            [ thead []
                [ tr [] [ th [] [], th [] [ text "ユーザー名" ], th [] [ text "フルネーム" ], th [] [ text "Email" ], th [] [ text "公開鍵" ], th [] [ text "SDGs" ] ]
                ]
            , tbody [] <|
                List.map showItem users
            ]
        ]


showPanels model filteredUsers =
    div []
        [ div [ id "list-people-wrapper" ] <|
            List.map (\u -> mkPeopleDivInList model model.newSessionStatus.selected u.id)
                filteredUsers
        , div
            [ style "clear" "both" ]
            []
        ]


mkPeopleDivInList : Model -> Set.Set String -> String -> Html Msg
mkPeopleDivInList model selected user =
    let
        email =
            Maybe.withDefault "" <| Maybe.andThen (.emails >> List.head) (getUserInfo model user)
    in
    case getUserInfo model user of
        Just userInfo ->
            div
                [ classList [ ( "userlist-person", True ), ( "active", Set.member user selected ), ( "online", userInfo.online ) ]
                , onClick (NewSessionMsg (TogglePersonInNew user))
                ]
                [ div [ class "userlist-info" ]
                    [ div [ class "name" ]
                        [ a [ href <| "#/profiles/" ++ user ]
                            [ text (getUserNameDisplay model user)
                            , if userInfo.online then
                                span [ class "online-mark" ] [ text "●" ]

                              else
                                text ""
                            ]
                        ]
                    , div [ class "userlist-email" ] [ text email ]
                    ]
                , div [ class "userlist-img-div" ] [ img [ class "userlist-img", src userInfo.avatar ] [] ]
                ]

        Nothing ->
            text ""


updateUserListPageModel : UserListPageMsg -> UserListPageModel -> ( UserListPageModel, Cmd msg )
updateUserListPageModel msg model =
    case msg of
        CheckUserWithIdOnly b ->
            ( { model | userWithIdOnly = b }, saveConfig { userWithEmailOnly = b } )

        ChangeShowMode s ->
            case s of
                Table ->
                    ( { model | showMode = s }, Cmd.none )

                Panel ->
                    ( { model | showMode = s }, Cmd.none )


initialUserListPageModel show_users_with_email_only =
    { userWithIdOnly = show_users_with_email_only, showMode = Table }
