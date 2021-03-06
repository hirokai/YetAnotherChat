port module UserPageView exposing (getMessageCount, updateUserPageModel, userPageView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


port saveSDGs : String -> Cmd msg


userPageView : User -> Model -> { title : String, body : List (Html Msg) }
userPageView user model =
    { title = user.fullname ++ ": " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 []
                        [ text <| getUserNameDisplay model user.id
                        , span [] [ text " " ]
                        , if user.registered then
                            span [ title <| appName ++ "に登録済", class "badge badge-primary" ] [ text "登録ユーザー" ]

                          else
                            span [ title <| appName ++ "に未登録（Emailから自動取り込み）", class "badge badge-secondary" ] [ text "未登録" ]
                        ]
                    , div []
                        [ span [] [ text "Email: ", text <| Maybe.withDefault "（未登録）" <| List.head user.emails ]
                        ]
                    , div [] [ a [ class "clickable", href <| "#/profiles/" ++ user.id ] [ text "プロフィールを見る" ] ]
                    , div [ id "user-messages" ]
                        [ h2 [] [ text "セッション" ]
                        , div [] [ text <| String.fromInt (List.length model.userPageModel.messages) ++ " messages in " ++ String.fromInt (List.length model.userPageModel.sessions) ++ " rooms." ]
                        , div [] <|
                            List.map
                                (\s ->
                                    div [ class "userpage-room-entry" ]
                                        [ span [ class "session_id" ] [ text <| "ID: " ++ s ]
                                        , h3 [ class "clickable userpage-room-name", onClick (EnterRoom s) ] [ text <| roomName s model ]
                                        , span [] [ text <| getMessageCount s model ]
                                        ]
                                )
                                model.userPageModel.sessions
                        ]
                    ]
                ]
            ]
        ]
    }


updateUserPageModel : UserPageMsg -> UserPageModel -> ( UserPageModel, Cmd msg )
updateUserPageModel msg model =
    case msg of
        FeedSessions ss ->
            ( { model | sessions = ss }, Cmd.none )

        FeedUserMessages ms ->
            ( { model | messages = ms }, Cmd.none )

        SetShownImageID id ->
            ( { model | shownFileID = Just id }, Cmd.none )

        AddNewFileBox ->
            ( { model | newFileBox = True, shownFileID = Nothing }, Cmd.none )

        DeletePosterImage file_id ->
            ( model, deleteFile file_id )

        SelectSDG i ->
            ( { model | selectedSDGs = toggleSet i model.selectedSDGs }, Cmd.none )

        SaveSDGs ->
            let
                s =
                    String.join "," <| List.map String.fromInt <| Set.toList model.selectedSDGs
            in
            ( model, saveSDGs s )


getMessageCount : String -> Model -> String
getMessageCount session_id model =
    case Dict.get session_id model.sessions of
        Just room ->
            let
                total =
                    Maybe.withDefault 0 <| Dict.get "__total" room.numMessages

                cs =
                    Dict.toList room.numMessages
            in
            String.fromInt total
                ++ " total. "
                ++ (String.join "," <|
                        List.filterMap
                            (\( name, count ) ->
                                if name == "__total" then
                                    Nothing

                                else
                                    Just <| getUserName model name ++ "(" ++ String.fromInt count ++ ")"
                            )
                            cs
                   )

        Nothing ->
            "N/A"
