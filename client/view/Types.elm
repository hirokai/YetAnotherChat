module Types exposing (ChatEntry(..), ChatFileTyp, ChatPageModel, CommentTyp, FilterMode(..), ListShowMode(..), LocalConfig, Member, Model, Msg(..), NewSessionModel, NewSessionMsg(..), NewWorkspaceModel, NewWorkspaceMsg(..), Page(..), SessionEventTyp, SessionID, SessionInfo, SessionMsg(..), SettingsMsg(..), SettingsPageModel, User, UserListPageModel, UserListPageMsg(..), UserPageModel, UserPageMsg(..), Workspace, WorkspaceEditModel, WorkspaceEditMsg(..), WorkspaceListModel, WorkspaceListMsg(..), WorkspaceModel, WorkspaceMsg(..), appName, getId, getKind, getRoomID, getSDGs, getUser, getUserFullname, getUserInfo, getUserName, getUserNameDisplay, roomName, roomUsers, toggleSet, truncate)

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
    , owner : String
    , members : List String
    , visibility : String
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


type alias SessionID =
    String


type alias SessionInfo =
    { id : String
    , name : String
    , formattedTime : String
    , members : List Member
    , owner : String
    , workspace : String
    , visibility : String
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
    , myself : Member
    , workspaces : Dict String Workspace
    , sessions : Dict SessionID SessionInfo
    , users : Dict String User
    , files :
        Dict String
            (List
                { file_id : String
                , url : String
                }
            )
    , profile :
        { publicKey : String
        , privateKey : String
        , privateKeyMsg : String
        }
    , newSessionModel : NewSessionModel
    , newWorkspaceModel : NewWorkspaceModel
    , workspaceModel : WorkspaceModel
    , workspaceListModel : WorkspaceListModel
    , workspaceEditModel : WorkspaceEditModel
    , userPageModel : UserPageModel
    , chatPageStatus : ChatPageModel
    , userListPageModel : UserListPageModel
    , settingsPageModel : SettingsPageModel
    , loaded :
        { workspaces : Bool
        , workspace : Bool
        , sessions : Bool
        , session : Bool
        , users : Bool
        , user : Bool
        }
    , editing : Set String
    , editingValue : Dict String String
    , timezone : Zone
    , searchKeyword : String
    , localConfig : LocalConfig
    }


type alias LocalConfig =
    { show_toppane : Bool
    , expand_toppane : Bool
    , expand_chatinput : Bool
    , show_users_with_email_only : Bool
    }


type alias NewSessionModel =
    { selected : Set Member
    , sessions_same_members : List SessionID
    }


type alias UserPageModel =
    { sessions : List SessionID
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


type alias WorkspaceModel =
    { sessions : List String
    , selectedMembers : Set String
    }


type alias WorkspaceListModel =
    { showMode : ListShowMode }


type alias WorkspaceEditModel =
    { name : String }


type ListShowMode
    = Table
    | Panel


type alias UserListPageModel =
    { userWithIdOnly : Bool, showMode : ListShowMode }


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
    = RoomPage SessionID
    | SessionListPage
    | UserPage String
    | UserListPage
    | UserProfilePage String
    | ProfileEditPage
    | UserSettingPage
    | WorkspaceListPage
    | WorkspacePage String
    | WorkspaceEditPage String
    | NewWorkspacePage
    | HomePage
    | NewSession
    | NotFound


type Msg
    = EnterRoom SessionID
    | EnterUser String
    | NewSessionMsg NewSessionMsg
    | NewWorkspaceMsg NewWorkspaceMsg
    | WorkspaceMsg WorkspaceMsg
    | WorkspaceListMsg WorkspaceListMsg
    | WorkspaceEditMsg WorkspaceEditMsg
    | UserPageMsg UserPageMsg
    | UserListPageMsg UserListPageMsg
    | SessionMsg SessionMsg
    | SettingsMsg SettingsMsg
    | StartSession (Set Member)
    | ReceiveNewSessionId { timestamp : Int, name : String, id : SessionID }
    | FeedRoomInfo Json.Value
    | FeedNewRoomInfo Json.Value
    | FeedWorkspaces (List Workspace)
    | FeedUsers (List User)
    | CreateWorkspace (Set Member)
    | ReloadSessions
    | EnterNewSessionScreen
    | StartEditing String String
    | UpdateEditingValue String String
    | FinishEditing String (Model -> Model) (Cmd Msg)
    | AbortEditing String
    | EditingKeyDown String (Model -> Model) (Cmd Msg) Bool { code : Int, shiftKey : Bool }
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
    | SaveConfigLocalBool String Bool
    | DeleteWorkspace String
    | SetVisibility String String String
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
    | ChangeShowMode ListShowMode


type SessionMsg
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
    | StartVideo SessionID
    | StopVideo SessionID
    | VideoJoin String
    | VideoLeft String


type WorkspaceMsg
    = FeedSessionsInWorkspace (List String)
    | StartNewSessionWS
    | SelectMember String Bool


type WorkspaceListMsg
    = ChangeShowModeWS ListShowMode


type WorkspaceEditMsg
    = FinishEditingWSE
    | InputNameWSE String


type SettingsMsg
    = UpdateConfigEditingValue String String
    | SaveConfigValue String
    | FeedConfigValues (List ( String, String ))


roomUsers : String -> Model -> List String
roomUsers room model =
    Maybe.withDefault [] <| Maybe.map .members <| Dict.get room model.sessions


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
    Maybe.withDefault "" <| Maybe.map .name (Dict.get id model.sessions)


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


getRoomID : Model -> Maybe SessionID
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
