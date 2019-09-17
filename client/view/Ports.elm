port module Ports exposing (createSession, createWorkspace, deleteFile, deleteSession, deleteWorkspace, downloadPrivateKey, feedMessages, feedNewRoomInfo, feedRoomInfo, feedSessionsInWorkspace, feedSessionsOf, feedSessionsWithSameMembers, feedUserImages, feedUserMessages, feedUsers, feedWorkspaces, getConfig, getCurrentSessionInfo, getMessages, getRoomInfo, getSessionsInWorkspace, getSessionsOf, getSessionsWithSameMembers, getUserMessages, getUsers, hashChanged, initializeData, joinRoom, logout, onChangeData, recalcElementPositions, receiveNewRoomInfo, reloadSession, reloadSessions, removeItemRemote, resetKeys, resetUserCache, saveConfig, scrollTo, scrollToBottom, sendRoomName, setConfigLocal, setPageHash, setValue, setVisibility, startPosterSession, startVideo, stopVideo, uploadPrivateKey, videoJoin, videoLeft)

import Json.Decode as Json
import Types exposing (..)


port setConfigLocal : { key : String, value : String } -> Cmd msg


port sendRoomName : { id : String, new_name : String } -> Cmd msg


port setValue : (( String, String ) -> msg) -> Sub msg


port reloadSessions : () -> Cmd msg


port getUsers : () -> Cmd msg


port feedUsers : (List User -> msg) -> Sub msg


port feedWorkspaces : (List Workspace -> msg) -> Sub msg


port onChangeData : ({ resource : String, id : String, operation : String } -> msg) -> Sub msg


port setVisibility : { kind : String, id : String, visibility : String } -> Cmd msg


port initializeData : () -> Cmd msg


port getMessages : SessionID -> Cmd msg


port getUserMessages : String -> Cmd msg


port getCurrentSessionInfo : String -> Cmd msg


port getRoomInfo : () -> Cmd msg


port getSessionsWithSameMembers : { members : List String, is_all : Bool } -> Cmd msg


port getSessionsOf : String -> Cmd msg


port feedSessionsWithSameMembers : (List String -> msg) -> Sub msg


port feedSessionsOf : (List String -> msg) -> Sub msg


port feedSessionsInWorkspace : (List String -> msg) -> Sub msg


port getSessionsInWorkspace : String -> Cmd msg


port getConfig : () -> Cmd msg


port scrollTo : String -> Cmd msg


port scrollToBottom : () -> Cmd msg


port createWorkspace : ( String, List Member ) -> Cmd msg


port createSession : { workspace : String, name : String, members : List String, redirect : Bool } -> Cmd msg


port feedMessages : (Json.Value -> msg) -> Sub msg


port feedUserMessages : (Json.Value -> msg) -> Sub msg


port feedRoomInfo : (Json.Value -> msg) -> Sub msg


port feedNewRoomInfo : (Json.Value -> msg) -> Sub msg


port receiveNewRoomInfo : ({ name : String, id : SessionID, timestamp : Int } -> msg) -> Sub msg


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


port deleteWorkspace : String -> Cmd msg


port reloadSession : String -> Cmd msg


port downloadPrivateKey : () -> Cmd msg


port uploadPrivateKey : () -> Cmd msg


port resetKeys : () -> Cmd msg


port resetUserCache : () -> Cmd msg


port startVideo : String -> Cmd msg


port stopVideo : String -> Cmd msg


port videoJoin : (String -> msg) -> Sub msg


port videoLeft : (String -> msg) -> Sub msg


port logout : () -> Cmd msg
