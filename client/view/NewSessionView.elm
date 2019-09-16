module NewSessionView exposing (mkSessionRowInList, newSessionView, updateNewSessionStatus)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Navigation exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


newSessionView : Model -> { title : String, body : List (Html Msg) }
newSessionView model =
    { title = appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text "新しい会話を開始" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (\u -> mkPeoplePanel model model.newSessionModel.selected u.id)
                            (List.map Tuple.second <| Dict.toList model.users)
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (StartSession model.newSessionModel.selected) ] [ text "開始" ] ]
                    , hr [ style "margin" "10px" ] []
                    , h2 [] [ text "過去の同じメンバーの会話" ]
                    , ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionModel.sessions_same_members)
                    ]
                ]
            ]
        ]
    }


mkSessionRowInList : Model -> SessionID -> Html Msg
mkSessionRowInList model room_id =
    let
        room_ : Maybe SessionInfo
        room_ =
            Dict.get room_id model.sessions
    in
    case room_ of
        Just room ->
            tr []
                [ td [] [ a [ href <| "#/sessions/" ++ room.id ] [ text room.name ] ]
                , td [] <| List.intersperse (text ", ") (List.map (\u -> a [ href <| "/main#" ++ pageToPath (UserPage u), class "clickable" ] [ text (getUserName model u) ]) (roomUsers room.id model))
                , td [] [ text <| ourFormatter model.timezone room.lastMsgTime ]
                ]

        Nothing ->
            text ""


updateNewSessionStatus : NewSessionMsg -> NewSessionModel -> ( NewSessionModel, Cmd msg )
updateNewSessionStatus msg model =
    case msg of
        TogglePersonInNew user ->
            let
                newSelected =
                    toggleSet user model.selected
            in
            ( { model | selected = newSelected }
            , if Set.isEmpty newSelected then
                Cmd.none

              else
                getSessionsWithSameMembers { members = Set.toList newSelected, is_all = True }
            )

        FeedSessionsWithSameMembers ss ->
            ( { model | sessions_same_members = ss }, Cmd.none )
