module UserPageView exposing (getMessageCount, updateUserPageStatus, userPageView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


userPageView : String -> Model -> { title : String, body : List (Html Msg) }
userPageView user model =
    let
        user_info =
            getUserInfo model user
    in
    { title = (Maybe.withDefault "" <| Maybe.map .fullname user_info) ++ ": " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text <| getUserNameDisplay model user ]
                    , div []
                        [ span [] [ text "Email: ", text <| Maybe.withDefault "（未登録）" <| Maybe.andThen (.emails >> List.head) user_info ]
                        ]
                    , div [] [ a [ class "clickable", href <| "#/profiles/" ++ user ] [ text "プロフィールを見る" ] ]
                    , div [ id "user-messages" ]
                        [ h2 [] [ text "メッセージ" ]
                        , div [] [ text <| String.fromInt (List.length model.userPageStatus.messages) ++ " messages in " ++ String.fromInt (List.length model.userPageStatus.sessions) ++ " rooms." ]
                        , div [] <|
                            List.map
                                (\s ->
                                    div [ class "userpage-room-entry" ]
                                        [ span [ class "session_id" ] [ text <| "ID: " ++ s ]
                                        , h3 [ class "clickable userpage-room-name", onClick (EnterRoom s) ] [ text <| roomName s model ]
                                        , span [] [ text <| getMessageCount s model ]
                                        ]
                                )
                                model.userPageStatus.sessions
                        ]
                    ]
                ]
            ]
        ]
    }


updateUserPageStatus : UserPageMsg -> UserPageModel -> ( UserPageModel, Cmd msg )
updateUserPageStatus msg model =
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


getMessageCount : String -> Model -> String
getMessageCount session_id model =
    case Dict.get session_id model.roomInfo of
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
