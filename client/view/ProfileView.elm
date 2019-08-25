module ProfileView exposing (userProfileView)

import Components exposing (..)
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import List.Extra
import Maybe.Extra exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


userProfileView : User -> Model -> { title : String, body : List (Html Msg) }
userProfileView user model =
    let
        user_files =
            Maybe.withDefault [] <| Dict.get user.id model.files

        current_file =
            List.Extra.find (\f -> Just f.file_id == model.userPageStatus.shownFileID) user_files

        current_file_id =
            Maybe.withDefault "" <| Maybe.map .file_id current_file
    in
    { title = user.fullname ++ ": " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text <| getUserNameDisplay model user.id ]
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
                                        ++ (if Maybe.Extra.isJust model.userPageStatus.shownFileID then
                                                ""

                                            else
                                                " disabled"
                                           )
                                    )
                                , onClick (StartNewPosterSession (Maybe.withDefault "" model.userPageStatus.shownFileID))
                                ]
                                [ text "ポスターセッションを開始" ]
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }
