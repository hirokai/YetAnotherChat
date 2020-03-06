module Main exposing (Flags, init, main, subscriptions, update, view)

import Browser
import Decoders exposing (..)
import Dict
import HomeView exposing (..)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Maybe.Extra exposing (..)
import Navigation exposing (..)
import NewSessionView exposing (..)
import Ports exposing (..)
import ProfileView exposing (..)
import Regex exposing (..)
import SessionListView exposing (..)
import SessionView exposing (..)
import Set
import SettingsView exposing (..)
import Task
import Time exposing (utc)
import Types exposing (..)
import UserListView exposing (..)
import UserPageView exposing (..)
import Workspace exposing (..)


type alias Model =
    {}


init : Flags -> ( Model, Cmd MsgMail )
init {} =
    ( {}
    , Cmd.none
    )


main : Program Flags Model MsgMail
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type MsgMail
    = NoOp1


update : MsgMail -> Model -> ( Model, Cmd MsgMail )
update msg model =
    case msg of
        NoOp1 ->
            ( model, Cmd.none )


view : Model -> Browser.Document MsgMail
view model =
    { title = "Mail view"
    , body =
        [ div [ id "view" ] [ p [] [ text "ほげ" ] ] ]
    }


subscriptions : Model -> Sub MsgMail
subscriptions _ =
    Sub.none


type alias Flags =
    {}
