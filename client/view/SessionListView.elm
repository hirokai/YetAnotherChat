module SessionListView exposing (sessionListView, updateSessionListPageStatus)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Navigation exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


numPages : Model -> Int
numPages model =
    Dict.size model.sessions // 20 + 1


sessionListView : Model -> { title : String, body : List (Html Msg) }
sessionListView model =
    let
        mkSessionRowInList : SessionInfo -> Html Msg
        mkSessionRowInList s =
            let
                ws_m =
                    Dict.get s.workspace model.workspaces

                ws_name =
                    Maybe.withDefault "" <| Maybe.map .name ws_m
            in
            tr []
                [ td [ class "workspace" ] [ a [ href <| "#/workspaces/" ++ s.workspace ] [ text ws_name ] ]
                , td [] [ a [ href <| "#/sessions/" ++ s.id ] [ text s.name ] ]
                , td [ class "visibility" ] [ text <| showVisibility s.visibility ]

                -- , td [] [ a [ href <| "#/users/" ++ s.owner ] [ text <| getUserNameDisplay model s.owner ] ]
                , td [ class "members" ] <| List.intersperse (text ", ") (List.map (\u -> a [ href <| "/main#" ++ pageToPath (UserPage u), classList [ ( "clickable", True ), ( "owner", s.owner == u ) ] ] [ text (getUserName model u) ]) (roomUsers s.id model))
                , td [] [ text <| ourFormatter model.timezone <| sessionLastUpdated s ]
                ]
    in
    { title = "List of sessions"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "セッション一覧", button [ class "btn btn-light", onClick ReloadSessions ] [ text "Reload" ] ]
                    , div []
                        [ a [ class "btn btn-light btn-sm", id "newroom-button", onClick (SessionListPageMsg PrevPage) ] [ text "<" ]
                        , a [ class "btn btn-light btn-sm", id "newroom-button", onClick (SessionListPageMsg NextPage) ] [ text ">" ]
                        , span [] [ text <| String.fromInt (model.sessionListPageModel.page + 1) ++ "/" ++ String.fromInt (numPages model) ]
                        , a [ class "btn btn-light", id "newroom-button", onClick EnterNewSessionScreen ] [ text "新しいセッション" ]
                        ]
                    , table [ id "session-list-table", class "table" ]
                        [ thead []
                            [ tr []
                                [ th [ class "workspace" ] [ text "ワークスペース" ]
                                , th [] [ text "名前" ]
                                , th [ class "visibility" ] [ text "公開範囲" ]

                                -- , th [] [ text "管理者" ]
                                , th [ class "members" ] [ text "メンバー" ]
                                , th [] [ text "最終更新" ]
                                ]
                            ]
                        , tbody [] <|
                            List.map (\r -> mkSessionRowInList r)
                                (List.take 20 <| List.drop (model.sessionListPageModel.page * 20) <| List.reverse <| List.sortBy (\s -> sessionLastUpdated s) (Dict.values model.sessions))
                        ]
                    , div
                        [ style "clear" "both" ]
                        []
                    ]
                ]
            ]
        ]
    }


updateSessionListPageStatus : SessionListPageMsg -> Model -> ( SessionListPageModel, Cmd msg )
updateSessionListPageStatus msg model =
    let
        page =
            smodel.page

        smodel =
            model.sessionListPageModel
    in
    case msg of
        NextPage ->
            ( { smodel
                | page =
                    if page < numPages model - 1 then
                        page + 1

                    else
                        page
              }
            , Cmd.none
            )

        PrevPage ->
            ( { smodel
                | page =
                    if page > 0 then
                        page - 1

                    else
                        page
              }
            , Cmd.none
            )
