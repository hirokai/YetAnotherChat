module SessionListView exposing (sessionListView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Navigation exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


sessionListView : Model -> { title : String, body : List (Html Msg) }
sessionListView model =
    { title = "List of sessions"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "セッション一覧", button [ class "btn btn-light", onClick ReloadSessions ] [ text "Reload" ] ]
                    , a [ class "btn btn-light", id "newroom-button", onClick EnterNewSessionScreen ] [ text "新しい会話" ]
                    , table [ id "list-sessions-wrapper", class "table" ]
                        [ thead []
                            [ tr []
                                [ th [] [ text "ワークスペース" ]
                                , th [] [ text "名前" ]
                                , th [] [ text "メンバー" ]
                                , th [] [ text "最終更新" ]
                                ]
                            ]
                        , tbody [] <|
                            List.map (\r -> mkSessionRowInList model r)
                                (Dict.keys model.sessions)
                        ]
                    , div
                        [ style "clear" "both" ]
                        []
                    ]
                ]
            ]
        ]
    }


mkSessionRowInList : Model -> SessionID -> Html Msg
mkSessionRowInList model room_id =
    case Dict.get room_id model.sessions of
        Just room ->
            let
                ws_m =
                    Dict.get room.workspace model.workspaces

                ws_name =
                    Maybe.withDefault "" <| Maybe.map .name ws_m
            in
            tr []
                [ td [] [ a [ href <| "#/workspaces/" ++ room.workspace ] [ text ws_name ] ]
                , td [] [ a [ href <| "#/sessions/" ++ room.id ] [ text room.name ] ]
                , td [] <| List.intersperse (text ", ") (List.map (\u -> a [ href <| "/main#" ++ pageToPath (UserPage u), class "clickable" ] [ text (getUserName model u) ]) (roomUsers room.id model))
                , td [] [ text <| ourFormatter model.timezone room.lastMsgTime ]
                ]

        Nothing ->
            text ""
