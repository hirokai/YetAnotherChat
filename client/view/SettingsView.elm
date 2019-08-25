port module SettingsView exposing (configSubscriptions, initialSettingsPageModel, updateSettingsPageStatus, userSettingView)

import Components exposing (..)
import Dict
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import Ports exposing (..)
import Regex exposing (..)
import Types exposing (..)


port setConfigValue : { key : String, value : String } -> Cmd msg


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
                            , a [ href <| "/main#/profiles/" ++ model.myself ] [ text "⇒詳細プロフィール編集" ]
                            ]
                        ]
                    , div [ class "setting-group" ]
                        [ h2 [] [ text "メール連携設定" ]
                        , div []
                            [ text "登録済Emailアドレスから "
                            , span [ class "monospace" ] [ text <| user.id ++ "@coi-sns.com" ]
                            , text <| "にメールを転送すると" ++ appName ++ "に取り込まれます。"
                            ]
                        , div []
                            [ span [] [ text "通知の頻度" ]
                            , span []
                                [ input [ type_ "range", Html.Attributes.min "1", Html.Attributes.max "5", value (Maybe.withDefault "" <| Dict.get "email_frequency" m1.configValues), onInput (SettingsMsg << UpdateConfigEditingValue "email_frequency") ] []
                                , span [] [ text <| getEmailFreqTxt model.settingsPageModel ]
                                ]
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
                            ]
                        , p [ style "font-size" "14px" ]
                            [ text "ユーザー間のメッセージ本文（文章・画像）は"
                            , a [ class "link", href "https://ja.wikipedia.org/wiki/%E6%A5%95%E5%86%86%E6%9B%B2%E7%B7%9A%E3%83%87%E3%82%A3%E3%83%95%E3%82%A3%E3%83%BC%E3%83%BB%E3%83%98%E3%83%AB%E3%83%9E%E3%83%B3%E9%8D%B5%E5%85%B1%E6%9C%89" ] [ text "楕円曲線ディフィー・ヘルマン鍵共有（ECDH）" ]
                            , text "および128ビット"
                            , a [ class "link", href "https://ja.wikipedia.org/wiki/Advanced_Encryption_Standard" ] [ text "AES-GCM" ]
                            , text "によってエンドツーエンド暗号化されています。秘密鍵は各ユーザーの端末のみに保存されるため，サーバー管理者でさえもエンドツーエンド暗号化された内容を読むことができません。ユーザー間の公開鍵の交換はサーバーを介して行われますが，公開鍵が改ざんされていないことがEthereumブロックチェーンで確認できます。"
                            , a [ href "/public_keys", class "link" ] [ text "鍵一覧のページ" ]
                            , br [] []
                            , text "同じユーザーが他の端末で使用する場合は，下記より秘密鍵を書き出してから他の端末で読み込むか，あるいは一時的にサーバーに秘密鍵を預けてから他の端末でログインすることで利用が可能になります。なお，送信日時，送信ユーザーIDなどのメタデータ，プロフィール情報はサーバー上に暗号化して保存され，サーバー管理者が読み取り可能です。"
                            ]
                        , div [ class "row" ]
                            [ div [ class "col-md-4 right-vline" ]
                                [ h3 []
                                    [ text "秘密鍵をサーバーに一時預け" ]
                                , button [ class "btn btn-primary", disabled (model.profile.privateKey == ""), onClick UploadPrivateKey ] [ text "預ける" ]
                                , br [] []
                                , span [ style "font-size" "14px" ] [ text "サーバーに5分間だけ秘密鍵を保管します。その間に他の利用端末でログインすると，秘密鍵が自動でダウンロードされ端末に保存されます。" ]
                                ]
                            , div [ class "col-md-4 right-vline" ]
                                [ h3 [] [ text "ファイルに書き出し" ]
                                , a
                                    [ classList [ ( "btn", True ), ( "btn-primary", True ), ( "disabled", model.profile.privateKey == "" ) ], onClick DownloadPrivateKey, download "private_key.json", id "download-private-key" ]
                                    [ text "書き出す" ]
                                ]
                            , div [ class "col-md-4" ]
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
                    ( model, setConfigValue { key = k, value = v } )

                Nothing ->
                    ( model, Cmd.none )

        FeedConfigValues vs ->
            let
                d =
                    Dict.fromList vs
            in
            ( { model | configValues = d }, Cmd.none )
