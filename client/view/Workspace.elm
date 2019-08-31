port module Workspace exposing (workspaceView, workspaceListView)

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

workspaceListView : Model ->  { title : String, body : List (Html Msg) }
workspaceListView model =
    { title = "Workspaces: " ++ appName
    , body = []
    }

workspaceView : Model -> Workspace ->  { title : String, body : List (Html Msg) }
workspaceView model ws =
    { title = ws.name ++ "- workspace: " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text <| ws.name ]
                    , div []
                        [ ul [] (List.map (\n -> li [] [text n]) ws.members)]
                    ]]]]
                  
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
