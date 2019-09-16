port module Workspace exposing (newWorkspaceView, updateNewWorkspaceModel, workspaceListView, workspaceView,updateWorkspaceModel)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)
import Navigation exposing (..)

port createSessionWS : {workspace: String, members: List String} -> Cmd msg


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
        mkSessionRow sid =
            case Dict.get sid model.sessions of
                Just session ->
                    tr []
                        [ 
                        td []
                            [ a [ class "clickable", href <| "#/sessions/" ++ sid ] [ text <| session.name ]
                            ]
                        ]
                Nothing ->
                    tr [] [ td [] [text "N/A"]]
        mkMemberRow uid =
            tr []
                [ td [] [input [type_ "checkbox", onCheck (WorkspaceMsg << SelectMember uid)][]],
                td []
                    [ a [ class "clickable", href <| "#/users/" ++ uid ] [ text <| getUserNameDisplay model uid ]
                    ]
                    , td [] [span [] [text <| Maybe.withDefault "" <| Maybe.andThen (\u -> List.head u.emails) <| getUserInfo model uid ]]
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
                    , if ws.owner == model.myself then div [] [button [class "btn btn-danger", onClick (DeleteWorkspace ws.id)] [text "削除"]] else text ""
                    , div [] [span [] [text "オーナー: "], span [] [text <| getUserNameDisplay model ws.owner]]
                    , section [] [
                        h2 [] [text "ワークスペースのメンバー"] 
                        , table [ class "table" ]
                            [ thead []
                                [ tr [] [ th [] [], th [] [ text "名前" ], th [] [text "Email"] ]
                                ]
                            , tbody [] <|
                                List.map
                                    mkMemberRow
                                    ws.members
                            ]
                        , div [] [button [class "btn btn-primary", onClick (WorkspaceMsg <| StartNewSessionWS)] [text "選択メンバーで新しいセッション"]]
                        
                    ]
                    , section [] [
                        h2 [] [text "セッション一覧"]
                         , table [ class "table" ]
                            [ thead []
                                [ tr [] [ th [] [ text "名前" ], th [] [text "メンバー"] ]
                                ]
                            , tbody [] <|
                                List.map
                                    mkSessionRow
                                    model.workspaceModel.sessions
                            ]
                    ]
                ]
            ]
        ]
        ]
    }


updateWorkspaceModel : String -> WorkspaceMsg -> WorkspaceModel -> (WorkspaceModel, Cmd msg)
updateWorkspaceModel wid msg model =
    case msg of
        FeedSessionsInWorkspace ws ->
            ({model | sessions = ws}, Cmd.none)
        StartNewSessionWS ->
            (model, createSession {redirect = True, workspace = wid, name = "", members = (Set.toList model.selectedMembers)})
        SelectMember uid selected ->
            ({model | selectedMembers = (if selected then Set.insert else Set.remove) uid model.selectedMembers }, Cmd.none)        


updateNewWorkspaceModel : NewWorkspaceMsg -> NewWorkspaceModel -> ( NewWorkspaceModel, Cmd msg )
updateNewWorkspaceModel msg model =
    case msg of
        TogglePersonInNewWS user ->
            let
                newSelected =
                    toggleSet user model.selected
            in
            ( { model | selected = newSelected }, Cmd.none )
