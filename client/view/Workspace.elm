port module Workspace exposing (newWorkspaceView, updateNewWorkspaceModel, workspaceListView, workspaceView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


newWorkspaceView : Model -> { title : String, body : List (Html Msg) }
newWorkspaceView model =
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "ワークスペースの新規作成" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (\u -> mkPeoplePanelWS model model.newWorkspaceModel.selected u.id)
                            (List.map Tuple.second <| Dict.toList model.users)
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (CreateWorkspace model.newWorkspaceModel.selected) ] [ text "作成" ] ]
                    ]
                ]
            ]
        ]
    }


mkPeoplePanelWS : Model -> Set.Set String -> String -> Html Msg
mkPeoplePanelWS model selected user =
    let
        email =
            Maybe.withDefault "" <| Maybe.andThen (.emails >> List.head) (getUserInfo model user)
    in
    div
        [ classList [ ( "person-panel", True ), ( "active", Set.member user selected || user == model.myself ) ]
        , if user == model.myself then
            attribute "_" "_"

          else
            onClick (NewWorkspaceMsg (TogglePersonInNewWS user))
        ]
        [ div [ class "name" ] [ text (getUserNameDisplay model user) ], div [ class "email" ] [ text email ] ]


workspaceListView : Model -> { title : String, body : List (Html Msg) }
workspaceListView model =
    { title = "Workspaces: " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "ワークスペース一覧" ]
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
                ]
            ]
        ]
    }


workspaceView : Model -> Workspace -> { title : String, body : List (Html Msg) }
workspaceView model ws =
    let
        mkRow uid =
            tr []
                [ td []
                    [ a [ class "clickable", href <| "#/users/" ++ uid ] [ text <| getUserNameDisplay model uid ]
                    ]
                ]
    in
    { title = ws.name ++ "- workspace: " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text <| "ワークスペース：" ++ ws.name ]
                    , div [] [span [] [text "オーナー: "], span [] [text <| getUserNameDisplay model ws.owner]]
                    , div []
                        [ table [ class "table" ]
                            [ thead []
                                [ tr [] [ th [] [ text "名前" ] ]
                                ]
                            , tbody [] <|
                                List.map
                                    mkRow
                                    ws.members
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }


updateNewWorkspaceModel : NewWorkspaceMsg -> NewWorkspaceModel -> ( NewWorkspaceModel, Cmd msg )
updateNewWorkspaceModel msg model =
    case msg of
        TogglePersonInNewWS user ->
            let
                newSelected =
                    toggleSet user model.selected
            in
            ( { model | selected = newSelected }, Cmd.none )
