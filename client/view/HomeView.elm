module HomeView exposing (homeView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


homeView : Model -> { title : String, body : List (Html Msg) }
homeView model =
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "ワークスペース" ]
                    , div [] <|
                        List.map (mkWorkspacePanel model) (Dict.values model.workspaces)
                            ++ [ div
                                    [ classList [ ( "ws-list-item ws-list-center", True ) ]
                                    ]
                                    [ div [ class "panel-center" ]
                                        [ a [ href "#/workspaces/new" ]
                                            [ text "+"
                                            ]
                                        ]
                                    ]
                               ]
                    ]
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "新しい会話を開始" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (\u -> mkPeoplePanel model model.newSessionModel.selected u.id)
                            (List.map Tuple.second <| Dict.toList model.users)
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (StartSession model.newSessionModel.selected) ] [ text "開始" ] ]
                    , h2 [] [ text "過去の同じメンバーの会話" ]
                    , ul [] <|
                        List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionModel.sessions_same_members
                    ]
                ]
            ]
        ]
    }
