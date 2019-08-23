port module Ports exposing (createNewSession, deleteFile, deleteSession, downloadPrivateKey, enterSession, feedMessages, feedRoomInfo, feedSessionsOf, feedSessionsWithSameMembers, feedUserImages, feedUserMessages, feedUsers, getMessages, getRoomInfo, getSessionsOf, getSessionsWithSameMembers, getUserMessages, getUsers, hashChanged, initializeData, joinRoom, logout, onChangeData, recalcElementPositions, receiveNewRoomInfo, reloadSession, removeItemRemote, resetKeys, resetUserCache, saveConfig, scrollTo, scrollToBottom, sendRoomName, setPageHash, setValue, startPosterSession, uploadPrivateKey)

import Json.Decode as Json
import Types exposing (..)


port sendRoomName : { id : String, new_name : String } -> Cmd msg


port setValue : (( String, String ) -> msg) -> Sub msg


port getUsers : () -> Cmd msg


port feedUsers : (List User -> msg) -> Sub msg


port onChangeData : ({ resource : String, id : String, operation : String } -> msg) -> Sub msg


port initializeData : () -> Cmd msg


port getMessages : RoomID -> Cmd msg


port getUserMessages : String -> Cmd msg


port getRoomInfo : () -> Cmd msg


port enterSession : String -> Cmd msg


port getSessionsWithSameMembers : { members : List String, is_all : Bool } -> Cmd msg


port getSessionsOf : String -> Cmd msg


port feedSessionsWithSameMembers : (List String -> msg) -> Sub msg


port feedSessionsOf : (List String -> msg) -> Sub msg


port scrollTo : String -> Cmd msg


port scrollToBottom : () -> Cmd msg


port createNewSession : ( String, List Member ) -> Cmd msg


port feedMessages : (Json.Value -> msg) -> Sub msg


port feedUserMessages : (Json.Value -> msg) -> Sub msg


port feedRoomInfo : (Json.Value -> msg) -> Sub msg


port receiveNewRoomInfo : ({ name : String, id : RoomID, timestamp : Int } -> msg) -> Sub msg


port hashChanged : (String -> msg) -> Sub msg


port removeItemRemote : String -> Cmd msg


port setPageHash : String -> Cmd msg


port recalcElementPositions : { show_toppane : Bool, expand_chatinput : Bool } -> Cmd msg


port saveConfig : { userWithEmailOnly : Bool } -> Cmd msg


port joinRoom : { session_id : String, user_id : String } -> Cmd msg


port feedUserImages : ({ user_id : String, images : List { url : String, file_id : String } } -> msg) -> Sub msg


port startPosterSession : String -> Cmd msg


port deleteFile : String -> Cmd msg


port deleteSession : { id : String } -> Cmd msg


port reloadSession : String -> Cmd msg


port downloadPrivateKey : () -> Cmd msg


port uploadPrivateKey : () -> Cmd msg


port resetKeys : () -> Cmd msg


port resetUserCache : () -> Cmd msg


port logout : () -> Cmd msg
