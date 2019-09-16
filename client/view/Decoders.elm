module Decoders exposing (chatEntriesDecoder, chatEntryDecoder, chatFileDecoder, commentTypDecoder, roomInfoDecoder, roomInfoListDecoder, sessionEventTypDecoder)

import Json.Decode as Json
import Json.Decode.Extra as JE
import Types exposing (..)


chatEntriesDecoder : Json.Decoder (List ChatEntry)
chatEntriesDecoder =
    Json.list chatEntryDecoder


commentTypDecoder : Json.Decoder CommentTyp
commentTypDecoder =
    Json.succeed CommentTyp
        |> JE.andMap (Json.field "id" Json.string)
        |> JE.andMap (Json.field "user" Json.string)
        |> JE.andMap (Json.field "comment" Json.string)
        |> JE.andMap (Json.field "session" Json.string)
        |> JE.andMap (Json.field "formattedTime" Json.string)
        |> JE.andMap (Json.field "originalUrl" Json.string)
        |> JE.andMap (Json.field "sentTo" Json.string)
        |> JE.andMap (Json.field "source" Json.string)


sessionEventTypDecoder : Json.Decoder SessionEventTyp
sessionEventTypDecoder =
    Json.succeed SessionEventTyp
        |> JE.andMap (Json.field "id" Json.string)
        |> JE.andMap (Json.field "session" Json.string)
        |> JE.andMap (Json.field "user" Json.string)
        |> JE.andMap (Json.field "timestamp" Json.string)
        |> JE.andMap (Json.field "action" Json.string)


chatFileDecoder : Json.Decoder ChatFileTyp
chatFileDecoder =
    Json.map6 ChatFileTyp
        (Json.field "id" Json.string)
        (Json.field "user" Json.string)
        (Json.field "file_id" Json.string)
        (Json.field "url" Json.string)
        (Json.field "formattedTime" Json.string)
        (Json.field "thumbnailBase64" Json.string)


chatEntryDecoder : Json.Decoder ChatEntry
chatEntryDecoder =
    Json.field "kind" Json.string
        |> Json.andThen
            (\kind ->
                case kind of
                    "comment" ->
                        Json.map Comment <| commentTypDecoder

                    "event" ->
                        Json.map SessionEvent <| sessionEventTypDecoder

                    "file" ->
                        Json.map ChatFile <| chatFileDecoder

                    _ ->
                        Json.fail "Unsupported kind"
            )


roomInfoListDecoder : Json.Decoder (List RoomInfo)
roomInfoListDecoder =
    Json.list roomInfoDecoder


roomInfoDecoder : Json.Decoder RoomInfo
roomInfoDecoder =
    Json.map8 RoomInfo
        (Json.field "id" Json.string)
        (Json.field "name" Json.string)
        (Json.field "formattedTime" Json.string)
        (Json.field "members" (Json.list Json.string))
        (Json.field "workspace" Json.string)
        (Json.field "firstMsgTime" Json.int)
        (Json.field "lastMsgTime" Json.int)
        (Json.field "numMessages" (Json.dict Json.int))
