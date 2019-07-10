port module Main exposing (ChatEntry(..), Flags, Member, Model, Msg(..), addComment, feedMatrix, feedMessages, getMembers, getMessages, iconOfUser, init, initialMessages, isSelected, main, mkComment, onKeyDown, scrollToBottom, showAll, showItem, subscriptions, update, view)

import Browser
import Dict exposing (..)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import List.Extra exposing (getAt)
import Maybe.Extra
import Svg exposing (g, rect, svg, text_)
import Svg.Attributes exposing (fill, fillOpacity, fontSize, stroke, strokeWidth, transform, x, y)
import Task


type alias CommentTyp =
    { user : String, comment : String, timestamp : String, originalUrl : String, sentTo : String, source : String }


type alias User =
    { id : String, name : String, avatar : String }


port getUsers : () -> Cmd msg


port getMessages : { timespan : String } -> Cmd msg


port getMessageAt : ( String, String, String ) -> Cmd msg


port scrollToBottom : () -> Cmd msg


port feedUsers : (List User -> msg) -> Sub msg


port feedMessages : (List CommentTyp -> msg) -> Sub msg


port feedMatrix : ({ users : List String, matrix : List (List Int), dates : List String } -> msg) -> Sub msg


port sendCommentToServer : String -> Cmd msg


onClickNoBubble message =
    Html.Events.custom "click" (Json.succeed { message = message, stopPropagation = True, preventDefault = True })


type ChatEntry
    = Comment CommentTyp
    | ChatFile { user : String, filename : String }


type alias Member =
    String


type alias RoomID =
    String


getUser : ChatEntry -> String
getUser c =
    case c of
        Comment { user } ->
            user

        ChatFile { user } ->
            user


type alias Model =
    { messages : List ChatEntry
    , onlineUsers : List Member
    , chatInput : String
    , chatTimestamp : String
    , selected : Dict Member Bool
    , room : RoomID
    , rooms : List RoomID
    , users : List String
    , userInfo : Dict String User
    , matrix : List (List Int)
    , dates : List String
    , selectedCell : Maybe ( Int, Int )
    , timespan : Timespan
    }


init : Flags -> ( Model, Cmd Msg )
init _ =
    ( { messages = initialMessages
      , chatInput = ""
      , chatTimestamp = ""
      , selected = showAll initialMessages
      , onlineUsers = []
      , room = "Home"
      , rooms = []
      , users = []
      , userInfo = Dict.empty
      , matrix = []
      , dates = []
      , selectedCell = Nothing
      , timespan = Day
      }
    , Cmd.batch [ getMessages { timespan = "day" }, getUsers () ]
    )


people : Model -> List ( String, Int )
people model =
    List.sortBy (\( u, c ) -> 0 - c) <| List.map (\u -> ( u, List.Extra.count (\m -> getUser m == u) model.messages )) <| List.Extra.unique <| List.map getUser model.messages


main : Program Flags Model Msg
main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }


type Timespan
    = Day
    | Week
    | Month


type Msg
    = Msg1
    | Msg2
    | InputComment String
    | SubmitComment
    | CommentBoxKeyDown Int
    | ToggleMember Member
    | FeedMatrix { users : List String, matrix : List (List Int), dates : List String }
    | FeedMessages (List CommentTyp)
    | ChoosePerson String
    | SelectCell Int Int
    | UnselectCell
    | FeedUsers (List { id : String, name : String, avatar : String })
    | SelectSpan Timespan


onKeyDown : (Int -> msg) -> Attribute msg
onKeyDown tagger =
    on "keydown" (Json.map tagger keyCode)


addComment model =
    { model | messages = List.append model.messages [ Comment { user = "myself", comment = model.chatInput, timestamp = model.chatTimestamp, originalUrl = "", sentTo = "all", source = "self" } ], chatInput = "" }


messageFilter : RoomID -> List ChatEntry -> List ChatEntry
messageFilter room msgs =
    let
        f m =
            if room == "Home" then
                True

            else if room == "COI" then
                Maybe.Extra.isJust <| List.Extra.elemIndex (getUser m) [ "matsubara", "yoshida" ]

            else
                getUser m == room
    in
    List.filter f msgs


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

        UnselectCell ->
            ( { model | selectedCell = Nothing, room = "", messages = [] }, Cmd.none )

        SelectCell col row ->
            let
                count =
                    if row == -1 then
                        Maybe.map (\ns -> List.sum ns) (getAt col model.matrix)

                    else
                        Maybe.andThen (\a -> getAt row a) (getAt col model.matrix)
            in
            if row == -1 then
                case ( getAt col model.dates, count ) of
                    ( Just d, Just count1 ) ->
                        if count1 > 0 then
                            ( { model | selectedCell = Just ( col, row ), room = Maybe.withDefault "" (getAt row model.users) }, getMessageAt ( d, "__all", printSpan model.timespan ) )

                        else
                            ( { model | selectedCell = Just ( col, row ), room = Maybe.withDefault "" (getAt row model.users), messages = [] }, Cmd.none )

                    _ ->
                        ( model, Cmd.none )

            else
                case ( getAt col model.dates, getAt row model.users, count ) of
                    ( Just d, Just u, Just count1 ) ->
                        if count1 > 0 then
                            ( { model | selectedCell = Just ( col, row ), room = Maybe.withDefault "" (getAt row model.users) }, getMessageAt ( d, u, printSpan model.timespan ) )

                        else
                            ( { model | selectedCell = Just ( col, row ), room = Maybe.withDefault "" (getAt row model.users), messages = [] }, Cmd.none )

                    _ ->
                        ( model, Cmd.none )

        ToggleMember m ->
            let
                v =
                    not (Dict.get m model.selected == Just True)
            in
            ( { model | selected = Dict.insert m v model.selected }, Cmd.none )

        FeedMatrix ms ->
            ( { model | matrix = ms.matrix, users = ms.users, dates = ms.dates }, Cmd.none )

        FeedMessages ms ->
            let
                f { user, comment, timestamp, originalUrl, sentTo, source } =
                    Comment { user = user, comment = comment, timestamp = timestamp, originalUrl = originalUrl, sentTo = sentTo, source = source }

                msgs =
                    List.map f ms
            in
            ( { model | messages = msgs }, Cmd.none )

        FeedUsers us ->
            ( { model | userInfo = Dict.fromList (List.map (\u -> ( u.id, u )) us) }, Cmd.none )

        ChoosePerson user ->
            let
                ( d, _ ) =
                    getCurrentDateAndUser model
            in
            ( { model | room = user, selectedCell = Maybe.map (\( date, _ ) -> ( date, getIndexFromUserId model user )) model.selectedCell }, getMessageAt ( d, user, printSpan model.timespan ) )

        SelectSpan span ->
            ( { model | timespan = span }, getMessages { timespan = printSpan span } )


getCurrentDateAndUser model =
    case model.selectedCell of
        Just ( col, row ) ->
            ( Maybe.withDefault "" <| getAt col model.dates, Maybe.withDefault "" <| getAt row model.users )

        Nothing ->
            ( "", "" )


getIndexFromUserId model id =
    Maybe.withDefault -1 (List.Extra.elemIndex id model.users)


printSpan s =
    case s of
        Day ->
            "day"

        Week ->
            "week"

        Month ->
            "month"


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


iconOfUser userInfo id =
    case Dict.get id userInfo of
        Just info ->
            "" ++ info.avatar

        Nothing ->
            ""


mkLink m =
    if m.originalUrl == "" then
        text m.source

    else
        a [ href m.originalUrl ] [ text m.source ]


showItem model e =
    case e of
        Comment m ->
            div [ class "chat_entry_comment" ]
                [ div [ style "float" "left" ] [ img [ class "chat_user_icon", src (iconOfUser model.userInfo m.user) ] [] ]
                , div [ class "chat_comment" ]
                    [ div [ class "chat_user_name" ]
                        [ text
                            (getName model.userInfo m.user
                                ++ (if m.sentTo /= "" then
                                        " to " ++ m.sentTo

                                    else
                                        ""
                                   )
                            )
                        , span [ class "chat_timestamp" ]
                            [ text m.timestamp
                            ]
                        , mkLink m
                        ]
                    , div [ class "chat_comment_content" ] <| mkComment m.comment
                    ]
                , div [ style "clear" "both" ] [ text "" ]
                ]

        ChatFile f ->
            div [ style "border" "1px solid red", style "padding" "10px", style "width" "500px", style "margin" "5px" ] [ text f.filename ]


isSelected : Model -> Member -> Bool
isSelected model m =
    Dict.get m model.selected == Just True


leftMenu : Model -> Html Msg
leftMenu model =
    div [ class "col-md-2 col-lg-2", id "menu-left" ]
        [ div [ id "lefttop-space" ] []
        , div [] <|
            case model.selectedCell of
                Just ( col, row ) ->
                    case ( getAt col model.dates, getAt row model.users ) of
                        ( Just d, _ ) ->
                            [ text d, br [] [], span [ class "clickable", onClick (SelectCell col -1) ] [ text (Maybe.withDefault "(N/A)" (Maybe.map (\a -> String.fromInt (List.sum a)) (getAt col model.matrix)) ++ " messages") ] ]

                        _ ->
                            [ text " " ]

                Nothing ->
                    [ text "Not selected" ]
        , ul
            [ class "menu-list" ]
          <|
            List.map
                (\( p, count ) ->
                    li
                        [ class
                            (if model.room == p then
                                "current-room"

                             else
                                ""
                            )
                        , onClick (ChoosePerson p)
                        ]
                        [ a [] [ text <| getName model.userInfo p ++ "(" ++ String.fromInt count ++ ")" ] ]
                )
            <|
                people model
        ]


hsl h s l =
    "hsl(" ++ String.fromInt h ++ "," ++ String.fromInt (round (s * 100)) ++ "%," ++ String.fromInt (round (l * 100)) ++ "%)"


colormap value =
    let
        v1 =
            Basics.min (Basics.max value 0) 1
    in
    hsl 120 v1 0.5


heat value =
    let
        v1 =
            Basics.min (Basics.max value 0) 1

        h =
            round ((1.0 - v1) * 240)
    in
    hsl h 1 0.5


cellSize =
    20


columnsPerBlock =
    50


class_ =
    Svg.Attributes.class


mkColumn : Maybe ( Int, Int ) -> Int -> Int -> ( String, List Int ) -> Svg.Svg Msg
mkColumn selected countMax i ( date, xs ) =
    let
        calcX xi yi =
            xi * cellSize

        calcY xi yi =
            yi * cellSize

        total =
            List.sum xs
    in
    g [ class_ "column", attribute "data-date" date ] <|
        ([ rect
            [ onClickNoBubble (SelectCell i -1)
            , Svg.Attributes.class
                ("activity-cell"
                    ++ (if selected == Just ( i, -1 ) then
                            " active"

                        else
                            ""
                       )
                )
            , x (String.fromInt (calcX i -1))
            , y (String.fromInt (calcY i -1 - 5))
            , width (cellSize - 2)
            , height (cellSize - 2)
            , fill
                (if total == 0 then
                    "#ddd"

                 else
                    colormap (toFloat total / toFloat countMax)
                )
            ]
            []
         ]
            ++ List.indexedMap
                (\j count ->
                    rect
                        [ onClickNoBubble (SelectCell i j)
                        , Svg.Attributes.class
                            ("activity-cell"
                                ++ (if selected == Just ( i, j ) then
                                        " active"

                                    else
                                        ""
                                   )
                            )
                        , x (String.fromInt (calcX i j))
                        , y (String.fromInt (calcY i j))
                        , width (cellSize - 2)
                        , height (cellSize - 2)
                        , fill
                            (if count == 0 then
                                "#ddd"

                             else
                                colormap (toFloat count / toFloat countMax)
                            )
                        ]
                        []
                )
                xs
        )


mkDateLabels dates =
    List.indexedMap
        (\i ds ->
            case List.head ds of
                Just d ->
                    text_ [ x (String.fromInt (i * cellSize * 7)), y "0", fontSize "14" ] [ text d ]

                Nothing ->
                    text_ [] []
        )
        (List.Extra.groupsOf 7 dates)


getName info id =
    case Dict.get id info of
        Just u ->
            u.name

        Nothing ->
            "N/A"


cellsOffsetX =
    130


countNormalizeFactor xss =
    Maybe.withDefault 0 <| List.maximum <| List.map (\xs -> Maybe.withDefault 0 (List.maximum xs)) xss


view : Model -> Browser.Document Msg
view model =
    { title = "Matrix view"
    , body =
        [ div [ class "container" ]
            [ div [ class "row" ]
                [ leftMenu model
                , div [ class "col-md-10 col-lg-10" ]
                    [ div [ id "toolbar" ] <|
                        [ button
                            [ class
                                ("btn btn-light"
                                    ++ (if model.timespan == Day then
                                            " active"

                                        else
                                            ""
                                       )
                                )
                            , onClick (SelectSpan Day)
                            ]
                            [ text "日" ]
                        , button
                            [ class
                                ("btn btn-light"
                                    ++ (if model.timespan == Week then
                                            " active"

                                        else
                                            ""
                                       )
                                )
                            , onClick (SelectSpan Week)
                            ]
                            [ text "週" ]
                        , button
                            [ class
                                ("btn btn-light"
                                    ++ (if model.timespan == Month then
                                            " active"

                                        else
                                            ""
                                       )
                                )
                            , onClick (SelectSpan Month)
                            ]
                            [ text "月" ]
                        , span [] [ text " " ]
                        ]
                            ++ [ p [] [ text "マスをクリックするとその日・人を選択。外をクリックすると選択解除。緑が明るいところが投稿が多い。" ] ]
                    , div [ id "matrix-wrapper", onClick UnselectCell ]
                        [ svg
                            [ id "matrix"
                            , width (List.length model.dates * cellSize + cellsOffsetX + 80)
                            , height (List.length model.users * cellSize + 80)
                            ]
                            [ g [ transform "translate(20,60)" ]
                                [ g [ id "matrix-usernames" ]
                                    ([ text_ [ x "0", y "-7" ] [ text "全員" ] ]
                                        ++ List.indexedMap (\i a -> text_ [ x "0", y (String.fromInt (i * 20 + 18)) ] [ text (getName model.userInfo a) ])
                                            model.users
                                    )
                                , g
                                    [ id "matrix-cells"
                                    , transform ("translate(" ++ String.fromInt cellsOffsetX ++ ",0)")
                                    , class_
                                        (if Maybe.Extra.isJust model.selectedCell then
                                            "selection-active"

                                         else
                                            ""
                                        )
                                    ]
                                    (List.indexedMap (mkColumn model.selectedCell (countNormalizeFactor model.matrix)) (List.Extra.zip model.dates model.matrix))
                                , g [ id "matrix-date-labels", transform ("translate(" ++ String.fromInt cellsOffsetX ++ ",-28)") ] (mkDateLabels model.dates)
                                ]
                            ]
                        ]
                    , div [] <|
                        List.map
                            (showItem model)
                            model.messages
                    ]
                ]
            ]
        ]
    }


subscriptions : Model -> Sub Msg
subscriptions model =
    Sub.batch [ feedMatrix FeedMatrix, feedMessages FeedMessages, feedUsers FeedUsers ]


initialMessages =
    []


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
