port module Workspace exposing (newWorkspaceView, updateNewWorkspaceModel, workspaceListView, updateWorkspaceEditModel, workspaceView,updateWorkspaceModel,updateWorkspaceListModel,workspaceEditView)

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
import Json.Decode as Json

port createSessionWS : {workspace: String, members: List String} -> Cmd msg

port saveWorkspace : { id : String, name : String } -> Cmd msg


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
                     , div [] 
                        [ span [] [ text "表示" ]
                        , button [ class "btn btn-sm btn-light", onClick (WorkspaceListMsg <| ChangeShowModeWS Table) ] [ text "テーブル" ]
                        , button [ class "btn btn-sm btn-light", onClick (WorkspaceListMsg <| ChangeShowModeWS Panel) ] [ text "パネル" ]
                        ]
                    , a [ href "#/workspaces/new", class "btn btn-primary"] [text "新しいワークスペース"]
                    , if model.workspaceListModel.showMode == Table then
                        showTable model <| Dict.values model.workspaces

                      else
                        showPanels model <| Dict.values model.workspaces
                    ]
                ]
            ]
        ]
    }

showPanels model workspaces = 
                    div [] <|
                        List.map (mkWorkspacePanel model) workspaces
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
                    

showTable : Model -> List Workspace -> Html Msg
showTable model workspaces =
    let
        showItem : Workspace -> Html Msg
        showItem ws =
            tr []
                [ td [] [], td [] [ a [ href <| "#/workspaces/" ++ ws.id ] [ text ws.name ] ]
                , td [] [ text <| showVisibility ws.visibility]
                , td [] [ if ws.owner == "" then text "(N/A)" else a [href <| "#/users/" ++ ws.owner] [text <| getUserNameDisplay model ws.owner]]
                , td [] (List.intersperse (text ", ") <| List.map (\n -> a [ class "clickable", href <| "#/users/" ++ n ] [ text (getUserName model n) ]) ws.members)
                ]

    in
    div []
        [ table [ class "table", id "userlist-table" ]
            [ thead []
                [ tr [] [ th [] [], th [] [ text "名前" ], th [] [text "公開範囲"], th [] [text "管理者"], th [] [ text "メンバー" ]]
                ]
            , tbody [] <|
                List.map showItem workspaces
            ]
        ]

workspaceView : Model -> Workspace -> { title : String, body : List (Html Msg) }
workspaceView model ws =
    let
        mkSessionRow sid =
            case Dict.get sid model.sessions of
                Just session ->
                    tr []
                        [ 
                        td []
                            [ text session.workspace, text ": ", a [ class "clickable", href <| "#/sessions/" ++ sid ] [ text <| session.name ]
                            ]
                        , td [] [text <| showVisibility session.visibility]
                        , td [] [a [href <| "#/users/" ++ session.owner, class "clickable"] [text <| getUserNameDisplay model session.owner]]
                        , td [] <| List.intersperse (text ", ") (List.map (\u -> a [ href <| "/main#" ++ pageToPath (UserPage u), class "clickable" ] [ text (getUserName model u) ]) (roomUsers sid model))
                        ]
                Nothing ->
                    tr [] [ td [] [text "N/A"]]
        mkMemberRow uid =
            tr []
                [ td [] [input [type_ "checkbox", onCheck (WorkspaceMsg << SelectMember uid)][]],
                td []
                    [ a [ class "clickable", href <| "#/users/" ++ uid ] [ text <| getUserNameDisplay model uid ]
                    ]
                , td [] [span [] [text <| Maybe.withDefault "" <| Maybe.andThen (\u -> List.head u.emails) <| getUserInfo model uid ]
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
                    , if ws.owner == model.myself then div [] [a [class "btn btn-light", href <| "#/workspaces/" ++ ws.id ++ "/edit"] [text "編集"]] else text ""
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
                                [ tr [] [ th [] [ text "名前" ], th [] [text "公開範囲"], th [] [text "管理者"], th [] [text "メンバー"] ]
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



workspaceEditView : Model -> Workspace -> { title : String, body : List (Html Msg) }
workspaceEditView model ws =
    let
        mkSessionRow sid =
            case Dict.get sid model.sessions of
                Just session ->
                    tr []
                        [ 
                        td []
                            [ a [ class "clickable", href <| "#/sessions/" ++ sid ] [ text <| session.name ]
                            ]
                        , td [] [text <| showVisibility session.visibility]
                        , td [] [a [href <| "#/users/" ++ session.owner, class "clickable"] [text <| getUserNameDisplay model session.owner]]
                        , td [] <| List.intersperse (text ", ") (List.map (\u -> a [ href <| "/main#" ++ pageToPath (UserPage u), class "clickable" ] [ text (getUserName model u) ]) (roomUsers sid model))
                        ]
                Nothing ->
                    tr [] [ td [] [text "N/A"]]
        mkMemberRow uid =
            tr []
                [ td [] [input [type_ "checkbox", onCheck (WorkspaceMsg << SelectMember uid)][]],
                td []
                    [ a [ class "clickable", href <| "#/users/" ++ uid ] [ text <| getUserNameDisplay model uid ]
                    ]
                , td [] [span [] [text <| Maybe.withDefault "" <| Maybe.andThen (\u -> List.head u.emails) <| getUserInfo model uid ]
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
                    , div [] [button [class "btn btn-light", onClick (WorkspaceEditMsg <| FinishEditingWSE)] [text "保存"],button [class "btn btn-danger", onClick (DeleteWorkspace ws.id)] [text "削除"]]
                    , div [] [label [for "ws-owner"] [text "オーナー: "], 
                        select [id "ws-owner"] <| List.map (\m -> option [] [text <| getUserNameDisplay model m]) ws.members
                    ]
                    , div [] [
                        label [] [text "名前"]
                        , input [type_ "input", value model.workspaceEditModel.name, onInput (WorkspaceEditMsg << InputNameWSE)] []
                    , div [] [
                        select
                    [ on "change" <| Json.map (SetVisibility "workspace" ws.id) targetValue ]
                    [ option [ value "public", selected (ws.visibility == "public") ] [ text "公開" ], option [ value "url", selected (ws.visibility == "url") ] [ text "URL共有" ], option [ value "private", selected (ws.visibility == "private") ] [ text "プライベート（招待のみ）" ] ]
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

updateWorkspaceListModel : WorkspaceListMsg -> WorkspaceListModel -> (WorkspaceListModel, Cmd msg)
updateWorkspaceListModel msg model =
    case msg of
        ChangeShowModeWS s ->
            ( { model | showMode = s }, Cmd.none )

updateNewWorkspaceModel : NewWorkspaceMsg -> NewWorkspaceModel -> ( NewWorkspaceModel, Cmd msg )
updateNewWorkspaceModel msg model =
    case msg of
        TogglePersonInNewWS user ->
            let
                newSelected =
                    toggleSet user model.selected
            in
            ( { model | selected = newSelected }, Cmd.none )


updateWorkspaceEditModel : String -> WorkspaceEditMsg -> WorkspaceEditModel -> (WorkspaceEditModel, Cmd msg)
updateWorkspaceEditModel ws_id msg model =
    case msg of
        FinishEditingWSE ->
            (model, saveWorkspace {id = ws_id, name = model.name})
        InputNameWSE s ->
            ({model | name = s}, Cmd.none)