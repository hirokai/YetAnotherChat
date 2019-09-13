module ProfileView exposing (profileEditView, userProfileView)

import Components exposing (..)
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import List.Extra
import Maybe.Extra exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


userProfileView : User -> Model -> { title : String, body : List (Html Msg) }
userProfileView user model =
    let
        user_files =
            Maybe.withDefault [] <| Dict.get user.id model.files

        current_file =
            List.Extra.find (\f -> Just f.file_id == model.userPageModel.shownFileID) user_files

        current_file_id =
            Maybe.withDefault "" <| Maybe.map .file_id current_file

        selectedSDGs : Set.Set Int
        selectedSDGs =
            model.userPageModel.selectedSDGs
    in
    { title = user.fullname ++ ": " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 []
                        [ text <| getUserNameDisplay model user.id
                        , a [ class "btn btn-light btn-sm", href "#/profiles/edit" ] [ text "編集" ]
                        ]
                    , div []
                        [ span [] [ text "Email: ", text <| Maybe.withDefault "（未登録）" <| (.emails >> List.head) user ]
                        ]
                    , div [] [ span [] [ text <| "Fingerprint: " ++ user.fingerprint ] ]
                    , div [ id "poster-div" ]
                        [ h2 [] [ text "ポスター" ]
                        , div []
                            (List.indexedMap
                                (\i f ->
                                    button
                                        [ class "btn btn-light btn-sm poster-tab-button"
                                        , classList [ ( "active", f.file_id == current_file_id ) ]
                                        , onClick (UserPageMsg <| SetShownImageID f.file_id)
                                        ]
                                        [ text (String.fromInt (1 + i) ++ ": " ++ f.file_id)
                                        , span [ class "clickable delete-poster", onClick (UserPageMsg <| DeletePosterImage f.file_id) ] [ text "×" ]
                                        ]
                                )
                                user_files
                            )
                        , div
                            [ classList [ ( "profile-img", True ) ]
                            , attribute "data-file_id" (Maybe.withDefault "" <| Maybe.map .file_id current_file)
                            ]
                            [ img [ src <| Maybe.withDefault "" <| Maybe.map .url current_file ] [] ]
                        , div []
                            [ button
                                [ classList [ ( "btn", True ), ( "btn-light", True ), ( "disabled", not <| Maybe.Extra.isJust model.userPageModel.shownFileID ) ]
                                , onClick (StartNewPosterSession (Maybe.withDefault "" model.userPageModel.shownFileID))
                                ]
                                [ text "ポスターセッションを開始" ]
                            ]
                        ]
                    , sdgsDiv user model False
                    ]
                ]
            ]
        ]
    }


profileEditView : Model -> { title : String, body : List (Html Msg) }
profileEditView model =
    case getUserInfo model model.myself of
        Just user ->
            let
                user_files =
                    Maybe.withDefault [] <| Dict.get user.id model.files

                current_file =
                    List.Extra.find (\f -> Just f.file_id == model.userPageModel.shownFileID) user_files

                current_file_id =
                    Maybe.withDefault "" <| Maybe.map .file_id current_file

                selectedSDGs : Set.Set Int
                selectedSDGs =
                    model.userPageModel.selectedSDGs
            in
            { title = "プロフィールを編集 - " ++ appName
            , body =
                [ div [ class "container-fluid" ]
                    [ div [ class "row" ]
                        [ leftMenu model
                        , smallMenu
                        , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                            [ h1 [] [ text <| "プロフィール編集: " ++ getUserNameDisplay model user.id ]
                            , div []
                                [ span [] [ text "Email: ", text <| Maybe.withDefault "（未登録）" <| (.emails >> List.head) user ]
                                ]
                            , div [] [ span [] [ text <| "Fingerprint: " ++ user.fingerprint ] ]
                            , div [ id "poster-div" ]
                                [ h2 [] [ text "ポスター" ]
                                , div []
                                    (List.indexedMap
                                        (\i f ->
                                            button
                                                [ class <|
                                                    "btn btn-light btn-sm poster-tab-button"
                                                        ++ (if f.file_id == current_file_id then
                                                                " active"

                                                            else
                                                                ""
                                                           )
                                                , onClick (UserPageMsg <| SetShownImageID f.file_id)
                                                ]
                                                [ text (String.fromInt (1 + i) ++ ": " ++ f.file_id)
                                                , span [ class "clickable delete-poster", onClick (UserPageMsg <| DeletePosterImage f.file_id) ] [ text "×" ]
                                                ]
                                        )
                                        user_files
                                        ++ (if user.id == model.myself then
                                                [ button [ class "btn btn-light btn-sm poster-tab-button poster-tab-button-add", onClick (UserPageMsg <| AddNewFileBox) ] [ text "+" ] ]

                                            else
                                                []
                                           )
                                    )
                                , div
                                    [ classList [ ( "profile-img", True ), ( "mine", user.id == model.myself ), ( "droppable", user.id == model.myself ) ]
                                    , attribute "data-file_id" (Maybe.withDefault "" <| Maybe.map .file_id current_file)
                                    ]
                                    [ img [ src <| Maybe.withDefault "" <| Maybe.map .url current_file ] [] ]
                                , div []
                                    [ button
                                        [ class
                                            ("btn btn-light"
                                                ++ (if Maybe.Extra.isJust model.userPageModel.shownFileID then
                                                        ""

                                                    else
                                                        " disabled"
                                                   )
                                            )
                                        , onClick (StartNewPosterSession (Maybe.withDefault "" model.userPageModel.shownFileID))
                                        ]
                                        [ text "ポスターセッションを開始" ]
                                    ]
                                ]
                            , sdgsDiv user model True
                            ]
                        ]
                    ]
                ]
            }

        Nothing ->
            { title = "プロフィールを編集 - " ++ appName, body = [] }


sdgsDiv : User -> Model -> Bool -> Html Msg
sdgsDiv user model editable =
    let
        selected =
            if editable then
                model.userPageModel.selectedSDGs

            else
                getSDGs user
    in
    div [ id "sdgs-div" ] <|
        [ h2
            []
            [ text "SDGs" ]
        , span [] [ text "" ]
        , if editable then
            div [] [ text "クリックで選択" ]

          else
            text ""
        ]
            ++ (List.map
                    (\i ->
                        (if editable then
                            div

                         else
                            a
                        )
                            ([ classList [ ( "SDGs-icon", True ), ( "selected", Set.member i selected ) ] ]
                                ++ (if editable then
                                        [ onClick (UserPageMsg <| SelectSDG i), href "#" ]

                                    else
                                        [ href (Maybe.withDefault ("#/profiles/" ++ user.id) <| Dict.get i sdgsLinkUrl) ]
                                   )
                            )
                            [ img
                                [ src (sdgIcon i)
                                ]
                                []
                            ]
                    )
                <|
                    List.range 1 17
               )
            ++ [ if editable then
                    div [] [ button [ class "btn btn-primary", onClick (UserPageMsg <| SaveSDGs) ] [ text "保存" ] ]

                 else
                    text ""
               ]


sdgsLinkUrl : Dict Int String
sdgsLinkUrl =
    let
        d : Dict.Dict Int String
        d =
            Dict.fromList
                [ ( 1, "goal-1-no-poverty.html" )
                , ( 2, "goal-2-zero-hunger.html" )
                , ( 3, "goal-3-good-health-and-well-being.html" )
                , ( 4, "goal-4-quality-education.html" )
                , ( 5, "goal-5-gender-equality.html" )
                , ( 6, "goal-6-clean-water-and-sanitation.html" )
                , ( 7, "goal-7-affordable-and-clean-energy.html" )
                , ( 8, "goal-8-decent-work-and-economic-growth.html" )
                , ( 9, "goal-9-industry-innovation-and-infrastructure.html" )
                , ( 10, "goal-10-reduced-inequalities.html" )
                , ( 11, "goal-11-sustainable-cities-and-communities.html" )
                , ( 12, "goal-12-responsible-consumption-and-production.html" )
                , ( 13, "goal-13-climate-action.html" )
                , ( 14, "goal-14-life-below-water.html" )
                , ( 15, "goal-15-life-on-land.html" )
                , ( 16, "goal-16-peace-justice-and-strong-institutions.html" )
                , ( 17, "goal-17-partnerships-for-the-goals.html" )
                ]
    in
    Dict.map (\_ s -> "http://www.jp.undp.org/content/tokyo/ja/home/sustainable-development-goals/" ++ s) d
