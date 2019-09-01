module Types exposing (ChatEntry(..), ChatFileTyp, ChatPageModel, ChatPageMsg(..), CommentTyp, FilterMode(..), Member, Model, Msg(..), NewSessionMsg(..), NewSessionStatus, NewWorkspaceModel, NewWorkspaceMsg(..), Page(..), RoomID, RoomInfo, SessionEventTyp, SettingsMsg(..), SettingsPageModel, User, UserListPageModel, UserListPageMsg(..), UserListShowMode(..), UserPageModel, UserPageMsg(..), Workspace, appName, getId, getKind, getRoomID, getSDGs, getUser, getUserFullname, getUserInfo, getUserName, getUserNameDisplay, roomName, roomUsers, toggleSet, truncate)

import Dict exposing (Dict)
import Json.Decode as Json
import List.Extra
import Set exposing (Set)
import Time exposing (Zone)


appName : String
appName =
    "COI SNS"


type alias Workspace =
    { id : String
    , name : String
    , members : List String
    }


type alias CommentTyp =
    { id : String
    , user : String
    , comment : String
    , session : String
    , formattedTime : String
    , originalUrl : String
    , sentTo : String
    , source : String
    }


type alias SessionEventTyp =
    { id : String
    , session : String
    , user : String
    , timestamp : String
    , action : String
    }


type alias User =
    { username : String
    , id : String
    , fullname : String
    , emails : List String
    , avatar : String
    , online : Bool
    , registered : Bool
    , fingerprint : String
    , profile : List ( String, String )
    }


type alias Member =
    String


type alias RoomID =
    String


type alias RoomInfo =
    { id : String
    , name : String
    , formattedTime : String
    , members : List Member
    , firstMsgTime : Int
    , lastMsgTime : Int
    , numMessages : Dict String Int
    }


type alias ChatFileTyp =
    { id : String
    , user : String
    , file_id : String
    , url : String
    , formattedTime : String
    , thumbnailBase64 : String
    }


type ChatEntry
    = Comment CommentTyp
    | ChatFile ChatFileTyp
    | SessionEvent SessionEventTyp


type alias Model =
    { page : Page
    , workspaces : Dict String Workspace
    , rooms : List RoomID
    , users : Dict String User
    , myself : Member
    , selected : Set String
    , roomInfo : Dict RoomID RoomInfo
    , newSessionStatus : NewSessionStatus
    , newWorkspaceModel : NewWorkspaceModel
    , userPageModel : UserPageModel
    , chatPageStatus : ChatPageModel
    , userListPageModel : UserListPageModel
    , settingsPageModel : SettingsPageModel
    , editing : Set String
    , editingValue : Dict String String
    , files :
        Dict String
            (List
                { file_id : String
                , url : String
                }
            )
    , timezone : Zone
    , searchKeyword : String
    , profile :
        { publicKey : String
        , privateKey : String
        , privateKeyMsg : String
        }
    }


type alias NewSessionStatus =
    { selected : Set Member
    , sessions_same_members : List RoomID
    }


type alias UserPageModel =
    { sessions : List RoomID
    , messages : List ChatEntry
    , shownFileID : Maybe String
    , newFileBox : Bool
    , selectedSDGs : Set Int
    }


type alias SettingsPageModel =
    { configValues : Dict.Dict String String
    }


type alias NewWorkspaceModel =
    { selected : Set Member
    }


type UserListShowMode
    = Table
    | Panel


type alias UserListPageModel =
    { userWithIdOnly : Bool, showMode : UserListShowMode }


type FilterMode
    = Date
    | Person
    | Thread


type alias ChatPageModel =
    { filterMode : FilterMode
    , filter : Set String
    , users : List String
    , messages : Maybe (List ChatEntry)
    , topPaneExpanded : Bool
    , shrunkEntries : Bool
    , fontSize : Int -- 1 to 5
    , expandChatInput : Bool
    , chatInputActive : Bool
    , showVideoDiv : Bool
    , videoMembers : Set String
    }


type Page
    = RoomPage RoomID
    | SessionListPage
    | UserPage String
    | UserListPage
    | UserProfilePage String
    | ProfileEditPage
    | UserSettingPage
    | WorkspaceListPage
    | WorkspacePage String
    | NewWorkspacePage
    | HomePage
    | NewSession
    | NotFound


type Msg
    = ToggleMember Member
    | EnterRoom RoomID
    | EnterUser String
    | NewSessionMsg NewSessionMsg
    | NewWorkspaceMsg NewWorkspaceMsg
    | UserPageMsg UserPageMsg
    | ChatPageMsg ChatPageMsg
    | UserListPageMsg UserListPageMsg
    | SettingsMsg SettingsMsg
    | StartSession (Set Member)
    | ReceiveNewSessionId { timestamp : Int, name : String, id : RoomID }
    | FeedRoomInfo Json.Value
    | FeedWorkspaces (List Workspace)
    | FeedUsers (List User)
    | CreateWorkspace (Set Member)
    | ReloadSessions
    | EnterNewSessionScreen
    | StartEditing String String
    | UpdateEditingValue String String
    | FinishEditing String (Model -> Model) (Cmd Msg)
    | AbortEditing String
    | EditingKeyDown String (Model -> Model) (Cmd Msg) { code : Int, shiftKey : Bool }
    | SetPageHash
    | HashChanged String
    | FeedUserImages { user_id : String, images : List { url : String, file_id : String } }
    | StartNewPosterSession String
    | Logout
    | SetTimeZone Zone
    | SubmitComment
    | SendCommentDone ()
    | OnChangeData { resource : String, id : String, operation : String }
    | DeleteRoom String
    | ReloadRoom String
    | SearchUser String
    | UploadPrivateKey
    | DownloadPrivateKey
    | ResetKeys
    | ResetUserCache
    | SetValue String String
    | NoOp


type NewWorkspaceMsg
    = TogglePersonInNewWS Member


type NewSessionMsg
    = TogglePersonInNew Member
    | FeedSessionsWithSameMembers (List String)


type UserPageMsg
    = FeedSessions (List String)
    | FeedUserMessages (List ChatEntry)
    | SetShownImageID String
    | AddNewFileBox
    | DeletePosterImage String
    | SelectSDG Int
    | SaveSDGs


type UserListPageMsg
    = CheckUserWithIdOnly Bool
    | ChangeShowMode UserListShowMode


type ChatPageMsg
    = SetFilterMode FilterMode
    | SetFilter String Bool
    | ScrollToBottom
    | FeedMessages (List ChatEntry)
    | RemoveItem String
    | ExpandTopPane Bool
    | SetShrinkEntries Bool
    | SmallerFont
    | LargerFont
    | ClickExpandInput
    | StartVideo RoomID
    | StopVideo RoomID
    | VideoJoin String
    | VideoLeft String


type SettingsMsg
    = UpdateConfigEditingValue String String
    | SaveConfigValue String
    | FeedConfigValues (List ( String, String ))


roomUsers : String -> Model -> List String
roomUsers room model =
    Maybe.withDefault [] <| Maybe.map .members <| Dict.get room model.roomInfo


truncate : Int -> String -> String
truncate n s =
    if String.length s > n then
        String.left n s ++ "..."

    else
        s


getUserInfo : Model -> String -> Maybe User
getUserInfo model uid =
    Dict.get uid model.users


getUserName : Model -> String -> String
getUserName model uid =
    case getUserInfo model uid of
        Just user ->
            user.username

        Nothing ->
            "<" ++ uid ++ ">"


getUserFullname : Model -> String -> String
getUserFullname model uid =
    case getUserInfo model uid of
        Just user ->
            user.fullname

        Nothing ->
            "<" ++ uid ++ ">"


roomName : String -> Model -> String
roomName id model =
    Maybe.withDefault "" <| Maybe.map .name (Dict.get id model.roomInfo)


getId : ChatEntry -> String
getId c =
    case c of
        Comment { id } ->
            id

        ChatFile { id } ->
            id

        SessionEvent { id } ->
            id


getUser : ChatEntry -> String
getUser c =
    case c of
        Comment { user } ->
            user

        ChatFile { user } ->
            user

        SessionEvent { user } ->
            user


getKind : ChatEntry -> String
getKind c =
    case c of
        Comment _ ->
            "comment"

        ChatFile _ ->
            "file"

        SessionEvent _ ->
            "event"


getRoomID : Model -> Maybe RoomID
getRoomID model =
    case model.page of
        RoomPage r ->
            Just r

        _ ->
            Nothing


toggleSet : comparable -> Set comparable -> Set comparable
toggleSet a xs =
    if Set.member a xs then
        Set.remove a xs

    else
        Set.insert a xs


getUserNameDisplay : Model -> String -> String
getUserNameDisplay model uid =
    case getUserInfo model uid of
        Just u ->
            if u.fullname == "" || u.fullname == u.username then
                u.username

            else
                u.fullname ++ " (" ++ u.username ++ ")"

        Nothing ->
            "(N/A)"


getSDGs : User -> Set Int
getSDGs user =
    case Dict.get "SDGs" (Dict.fromList user.profile) of
        Just s ->
            Set.fromList <| List.filterMap String.toInt <| String.split "," s

        Nothing ->
            Set.empty
