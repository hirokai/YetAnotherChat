port module SettingsView exposing (configSubscriptions, initialSettingsPageModel, updateSettingsPageStatus, userSettingView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Json.Decode as Json
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


port setConfigValue : { key : String, value : String } -> Cmd msg


port setProfileValue : { key : String, value : String } -> Cmd msg


port feedConfigValues : (List ( String, String ) -> msg) -> Sub msg


configSubscriptions : List (Sub Msg)
configSubscriptions =
    [ feedConfigValues (\s -> SettingsMsg <| FeedConfigValues s) ]


initialSettingsPageModel : SettingsPageModel
initialSettingsPageModel =
    { configValues = Dict.empty }


getEmailFreqTxt : SettingsPageModel -> String
getEmailFreqTxt model =
    case Maybe.withDefault 0 <| Maybe.andThen String.toInt <| Dict.get "email_frequency" model.configValues of
        1 ->
            "直ちに"

        2 ->
            "1時間"

        3 ->
            "6時間"

        4 ->
            "1日"

        5 ->
            "1週間"

        _ ->
            "N/A"


userSettingView : User -> Model -> { title : String, body : List (Html Msg) }
userSettingView user model =
    let
        m1 =
            model.settingsPageModel

        email_workspace =
            case model.localConfig.email_workspace of
                Just wid ->
                    Dict.get wid model.workspaces

                Nothing ->
                    Nothing

        import_email =
            case email_workspace of
                Just ws ->
                    user.id ++ "+" ++ ws.id ++ "@mail.coi-sns.com"

                Nothing ->
                    user.id ++ "@mail.coi-sns.com"
    in
    { title = getUserNameDisplay model model.myself ++ ": " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text <| "設定" ]
                    , div [ class "setting-group" ]
                        [ h2 [] [ text "基本情報" ]
                        , div []
                            [ div [ class "config-row" ]
                                [ span [ class "config-name" ] [ text "ID: " ]
                                , span [ class "config-value" ] [ text user.id ]
                                ]
                            , div [ class "config-row" ]
                                [ span [ class "config-name" ] [ text "ユーザー名: " ]
                                , input
                                    [ class "config-value"
                                    , value (Maybe.withDefault "" <| Dict.get "username" m1.configValues)
                                    , onInput (\s -> SettingsMsg <| UpdateConfigEditingValue "username" s)
                                    ]
                                    []
                                , button [ onClick (SettingsMsg <| SaveConfigValue "username") ] [ text "保存" ]
                                ]
                            , div [ class "config-row" ]
                                [ span [ class "config-name" ] [ text "フルネーム: " ]
                                , input
                                    [ class "config-value"
                                    , value (Maybe.withDefault "" <| Dict.get "fullname" m1.configValues)
                                    , onInput (\s -> SettingsMsg <| UpdateConfigEditingValue "fullname" s)
                                    ]
                                    []
                                , button [ onClick (SettingsMsg <| SaveConfigValue "fullname") ] [ text "保存" ]
                                ]
                            , div [ class "config-row" ]
                                [ span [ class "config-name" ] [ text "Email: " ]
                                , input
                                    [ class "config-value"
                                    , type_ "email"
                                    , value (Maybe.withDefault "" <| Dict.get "email" m1.configValues)
                                    , onInput (\s -> SettingsMsg <| UpdateConfigEditingValue "email" s)
                                    ]
                                    []
                                , button [ onClick (SettingsMsg <| SaveConfigValue "email") ] [ text "保存" ]
                                ]
                            , a [ href <| "/main#/profiles/edit" ] [ text "⇒詳細プロフィール編集" ]
                            ]
                        ]
                    , div [ class "setting-group" ]
                        [ h2 [] [ text "メール連携設定" ]
                        , div []
                            [ h3 [] [ text "メールの取り込み" ]
                            , div [ class "config-subsection" ]
                                [ text <| "登録済Emailアドレスからメールを転送すると" ++ appName ++ "に取り込まれます。"
                                , br [] []
                                , label [ for "import-to" ] [ text "取り込み先のワークスペース" ]
                                , select [ id "import-to", on "change" <| Json.map (SaveConfigLocal "email_workspace") targetValue ] <|
                                    option [ value "__none__", selected (Nothing == model.localConfig.email_workspace) ] [ text "（取り込まない）" ]
                                        :: List.map (\w -> option [ value w.id, selected (Just w.id == model.localConfig.email_workspace) ] [ text w.name ]) (Dict.values model.workspaces)
                                , br [] []
                                , span [] [ text "こちらに転送してください：" ]
                                , span [ class "monospace", id "config-import-email" ] [ text import_email ]
                                , br [] []
                                , span [ class "danger" ] [ text "注意：試験的機能であり，サーバー管理者によって取り込まれたメッセージが閲覧される可能性があります。" ]
                                ]
                            ]
                        , div []
                            [ h3 [] [ text "メールによる通知" ]
                            , span [] [ text "通知の頻度" ]
                            , span []
                                [ input [ type_ "range", Html.Attributes.min "1", Html.Attributes.max "5", value (Maybe.withDefault "" <| Dict.get "email_frequency" m1.configValues), onInput (SettingsMsg << UpdateConfigEditingValue "email_frequency") ] []
                                , span [] [ text <| getEmailFreqTxt model.settingsPageModel ]
                                ]
                            ]
                        ]
                    , div [ class "setting-group" ]
                        [ h2 [] [ text "画面設定（端末固有）" ]
                        , div []
                            [ input
                                [ id "config-show-toppane"
                                , type_ "checkbox"
                                , checked model.localConfig.show_toppane
                                , onCheck (SaveConfigLocalBool "show_toppane")
                                ]
                                []
                            , label [ for "config-show-toppane" ] [ text "画面上部のツールバーを表示する" ]
                            ]
                        ]
                    , div [ id "key-settings", class "setting-group" ]
                        [ h2 [] [ text "暗号化の設定" ]
                        , div []
                            [ ul []
                                [ li []
                                    [ span [] [ text "公開鍵のFingerprint: " ]
                                    , span [ classList [ ( "fingerprint", True ), ( "red", model.profile.publicKey == "" ) ] ]
                                        [ text
                                            (if model.profile.publicKey == "" then
                                                "（鍵がありません）"

                                             else
                                                model.profile.publicKey
                                            )
                                        ]
                                    ]
                                , li []
                                    [ span [] [ text "秘密鍵のFingerprint: " ]
                                    , span [ classList [ ( "fingerprint", True ), ( "red", model.profile.privateKey == "" ) ] ]
                                        [ text
                                            (if model.profile.privateKey == "" then
                                                "（鍵がありません）"

                                             else
                                                model.profile.privateKey
                                            )
                                        ]
                                    ]
                                ]
                            , div [ id "link-to-public-keys" ] [ a [ class "clickable", href "/public_keys" ] [ text "公開鍵の一覧" ] ]
                            ]
                        , div [ class "row" ]
                            [ div [ class "col-lg-3 col-md-6 right-vline" ]
                                [ h3 []
                                    [ text "秘密鍵をサーバーに一時預け" ]
                                , button [ class "btn btn-primary", disabled (model.profile.privateKey == ""), onClick UploadPrivateKey ] [ text "預ける" ]
                                , br [] []
                                , span [ style "font-size" "14px" ] [ text "サーバーに5分間だけ秘密鍵を保管します。その間に他の利用端末でログインすると，秘密鍵が自動でダウンロードされ端末に保存されます。" ]
                                ]
                            , div [ class "col-lg-3 col-md-6 right-vline" ]
                                [ h3 [] [ text "ファイルに書き出し" ]
                                , a
                                    [ classList [ ( "btn", True ), ( "btn-primary", True ), ( "disabled", model.profile.privateKey == "" ) ], onClick DownloadPrivateKey, download "private_key.json", id "download-private-key" ]
                                    [ text "書き出す" ]
                                ]
                            , div [ class "col-md-6" ]
                                [ h3 []
                                    [ text "秘密鍵ファイルを取り込み" ]
                                , input
                                    [ id "upload-private-key"
                                    , type_ "file"
                                    ]
                                    [ text "取り込む" ]
                                , span [] [ text model.profile.privateKeyMsg ]
                                ]
                            ]
                        , div [ style "margin-bottom" "10px" ] []
                        , div []
                            [ a [ class "btn btn-danger", onClick ResetKeys ] [ text "鍵を生成し直す" ]
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }


updateSettingsPageStatus : SettingsMsg -> SettingsPageModel -> ( SettingsPageModel, Cmd Msg )
updateSettingsPageStatus msg model =
    case msg of
        UpdateConfigEditingValue k v ->
            ( { model | configValues = Dict.insert k v model.configValues }, Cmd.none )

        SaveConfigValue k ->
            case Dict.get k model.configValues of
                Just v ->
                    if k == "username" || k == "fullname" || k == "email" then
                        ( model, setProfileValue { key = k, value = v } )

                    else
                        ( model, setConfigValue { key = k, value = v } )

                Nothing ->
                    ( model, Cmd.none )

        FeedConfigValues vs ->
            let
                d =
                    Dict.fromList vs
            in
            ( { model | configValues = d }, Cmd.none )
