port module EmailList exposing (init, main, subscriptions, update, view)

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


port feedEmails : (List Email -> msg) -> Sub msg


type alias Model =
    { loaded : Bool, emails : List Email, search : String }


type alias Email =
    { from : String
    , subject : String
    , date : String
    , message_id : String
    }


init : Flags -> ( Model, Cmd MsgMail )
init {} =
    ( { loaded = False, emails = [], search = "" }
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
    | FeedEmail (List Email)
    | InputSearch String


update : MsgMail -> Model -> ( Model, Cmd MsgMail )
update msg model =
    case msg of
        NoOp1 ->
            ( model, Cmd.none )

        FeedEmail emails ->
            ( { model | loaded = True, emails = emails }, Cmd.none )

        InputSearch s ->
            ( { model | search = s }, Cmd.none )


view : Model -> Browser.Document MsgMail
view model =
    { title = "Mail view"
    , body =
        let
            filterFunc e =
                String.contains model.search e.subject

            filtered =
                List.filter filterFunc model.emails
        in
        [ div [ class "container-fluid" ]
            [ div [ class "col-12" ]
                [ div [ classList [ ( "row", True ), ( "fadein", model.loaded ) ] ] <|
                    if model.loaded then
                        [ div
                            [ id "view" ]
                            (h1 [] [ text "メール一覧" ]
                                :: div [] [ span [] [ text "検索" ], input [ placeholder "検索キーワード", value model.search, onInput InputSearch ] [], text (String.fromInt (List.length filtered)) ]
                                :: List.map
                                    (\e ->
                                        div [ class "entry" ]
                                            [ div [ class "subject" ] [ a [ href <| "/emails/" ++ e.message_id ] [ text e.subject ] ]
                                            , div [ class "date" ] [ text e.date ]
                                            ]
                                    )
                                    filtered
                            )
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
