port module Email exposing (Flags, init, main, subscriptions, update, view)

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


port feedEmails : ({ subject : String, from : String } -> msg) -> Sub msg


type alias Model =
    { loaded : Bool, email : Email }


type alias Email =
    { subject : String
    , from : String
    }


init : Flags -> ( Model, Cmd MsgMail )
init {} =
    ( { loaded = False, email = { subject = "N/A", from = "N/A" } }
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
    | FeedEmail Email


update : MsgMail -> Model -> ( Model, Cmd MsgMail )
update msg model =
    case msg of
        NoOp1 ->
            ( model, Cmd.none )

        FeedEmail email ->
            ( { model | email = email, loaded = True }, Cmd.none )


view : Model -> Browser.Document MsgMail
view model =
    { title = "Mail view"
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "col-12" ]
                [ div [ classList [ ( "row", True ), ( "fadein", model.loaded ) ] ] <|
                    if model.loaded then
                        [ div
                            [ id "view" ]
                            [ h1 []
                                [ text
                                    (if model.email.subject == "" then
                                        "\u{3000}"

                                     else
                                        model.email.subject
                                    )
                                ]
                            , p [] [ text "From: ", text model.email.from ]
                            ]
                        ]

                    else
                        []
                ]
            ]
        ]
    }


subscriptions : Model -> Sub MsgMail
subscriptions _ =
    Sub.batch [ feedEmails FeedEmail ]


type alias Flags =
    {}