port module Main exposing (ChatEntry(..), Flags, Member, Model, Msg(..), addComment, feedMessages, getMembers, getMessages, iconOfUser, init, initialMessages, isSelected, main, mkComment, onKeyDown, scrollToBottom, showAll, showItem, subscriptions, update, view)

import Browser
import Dict exposing (..)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import List.Extra
import Maybe.Extra
import Task


type alias CommentTyp =
    { user : String, comment : String, timestamp : String, originalUrl : String, sentTo : String }


port getMessages : () -> Cmd msg


port scrollToBottom : () -> Cmd msg


port feedMessages : (List CommentTyp -> msg) -> Sub msg


port sendCommentToServer : String -> Cmd msg


type ChatEntry
    = Comment CommentTyp
    | ChatFile { user : String, filename : String }


type alias Member =
    String


type alias Model =
    { messages : List ChatEntry
    , onlineUsers : List Member
    , chatInput : String
    , chatTimestamp : String
    , selected : Dict Member Bool
    }


main : Program Flags Model Msg
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type Msg
    = Msg1
    | Msg2
    | InputComment String
    | SubmitComment
    | CommentBoxKeyDown Int
    | ToggleMember Member
    | FeedMessages (List CommentTyp)


onKeyDown : (Int -> msg) -> Attribute msg
onKeyDown tagger =
    on "keydown" (Json.map tagger keyCode)


addComment model =
    { model | messages = List.append model.messages [ Comment { user = "myself", comment = model.chatInput, timestamp = model.chatTimestamp, originalUrl = "", sentTo = "all" } ], chatInput = "" }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        Msg1 ->
            ( model, Cmd.none )

        Msg2 ->
            ( model, Cmd.none )

        InputComment s ->
            ( { model | chatInput = s }, Cmd.none )

        SubmitComment ->
            ( addComment model, Cmd.batch [ scrollToBottom (), sendCommentToServer model.chatInput ] )

        CommentBoxKeyDown code ->
            if code == 13 then
                ( addComment model, Cmd.batch [ scrollToBottom (), sendCommentToServer model.chatInput ] )

            else
                ( model, Cmd.none )

        ToggleMember m ->
            let
                v =
                    not (Dict.get m model.selected == Just True)
            in
            ( { model | selected = Dict.insert m v model.selected }, Cmd.none )

        FeedMessages ms ->
            let
                f { user, comment, timestamp, originalUrl, sentTo } =
                    Comment { user = user, comment = comment, timestamp = timestamp, originalUrl = originalUrl, sentTo = sentTo }

                msgs =
                    List.map f ms
            in
            ( { model | messages = msgs, selected = showAll msgs }, Cmd.none )


mkComment : String -> List (Html.Html msg)
mkComment s =
    let
        f s1 =
            if s1 == "\n" then
                br [] []

            else
                text s1
    in
    List.map f <| List.intersperse "\n" <| String.split "\n" s


iconOfUser name =
    case name of
        "myself" ->
            "img/myself_icon.jpg"

        otherwise ->
            "img/user_icon.png"


showItem model e =
    case e of
        Comment m ->
            if isSelected model m.user then
                div [ class "chat_entry_comment" ]
                    [ div [ style "float" "left" ] [ img [ class "chat_user_icon", src (iconOfUser m.user) ] [] ]
                    , div [ class "chat_comment" ]
                        [ div [ class "chat_user_name" ]
                            [ text
                                (m.user
                                    ++ (if m.sentTo /= "" then
                                            " to " ++ m.sentTo

                                        else
                                            ""
                                       )
                                )
                            , span [ class "chat_timestamp" ]
                                [ text m.timestamp
                                ]
                            , a [ href m.originalUrl ] [ text "Gmail" ]
                            ]
                        , div [ class "chat_comment_content" ] <| mkComment m.comment
                        ]
                    , div [ style "clear" "both" ] [ text "" ]
                    ]

            else
                text ""

        ChatFile f ->
            if isSelected model f.user then
                div [ style "border" "1px solid red", style "padding" "10px", style "width" "500px", style "margin" "5px" ] [ text f.filename ]

            else
                text ""


isSelected : Model -> Member -> Bool
isSelected model m =
    Dict.get m model.selected == Just True


view : Model -> Browser.Document Msg
view model =
    { title = "Slack clone"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ div [ class "col-md" ]
                    [ div [] <|
                        List.map
                            (\m ->
                                button
                                    [ type_ "button"
                                    , class
                                        ("btn btn-"
                                            ++ (if isSelected model m then
                                                    "primary"

                                                else
                                                    "secondary"
                                               )
                                        )
                                    , onClick (ToggleMember m)
                                    ]
                                    [ text m ]
                            )
                            (getMembers model.messages)
                    , div [ id "chat-entries" ] <|
                        List.map (showItem model) model.messages
                    , div [ id "footer_wrapper", class "fixed-bottom" ]
                        [ div [ id "footer" ]
                            [ input
                                [ value model.chatInput
                                , style "height" "30px"
                                , style "width" "90vw"
                                , onInput InputComment
                                , onKeyDown CommentBoxKeyDown
                                ]
                                []
                            , button [ class "btn btn-primary", onClick SubmitComment ] [ text "送信" ]
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch [ feedMessages FeedMessages ]


initialMessages =
    [-- Comment {comment = "昨日の論文の件はどうなりましたか？\n明日作業できればと思っています\nいかがでしょうか？", user = "fuga"}
    ]


getMembers : List ChatEntry -> List String
getMembers entries =
    let
        f c =
            case c of
                Comment { user } ->
                    user

                ChatFile { user } ->
                    user
    in
    List.Extra.unique <| List.map f entries


showAll messages =
    Dict.fromList <| List.map (\m -> ( m, True )) (getMembers messages)


type alias Flags =
    ()


init : Flags -> ( Model, Cmd Msg )
init _ =
    ( { messages = initialMessages
      , chatInput = ""
      , chatTimestamp = ""
      , selected = showAll initialMessages
      , onlineUsers = []
      }
    , getMessages ()
    )
