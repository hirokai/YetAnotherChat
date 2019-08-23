module HomeView exposing (homeView)

import Components exposing (..)
import Decoders exposing (roomInfoListDecoder)
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import List.Extra
import Ports exposing (..)
import Regex exposing (..)
import Set
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
                    [ h1 [] [ text "新しい会話を開始" ]
                    , div [ id "people-wrapper" ] <|
                        List.map (\u -> mkPeoplePanel model model.newSessionStatus.selected u.id)
                            model.users
                    , div
                        [ style "clear" "both" ]
                        []
                    , div [] [ button [ class "btn btn-primary btn-lg", onClick (StartSession model.newSessionStatus.selected) ] [ text "開始" ] ]
                    , h2 [] [ text "過去の同じメンバーの会話" ]
                    , ul [] (List.map (\s -> li [] [ a [ class "clickable", onClick (EnterRoom s) ] [ text (roomName s model) ] ]) model.newSessionStatus.sessions_same_members)
                    ]
                ]
            ]
        ]
    }
