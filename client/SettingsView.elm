module SettingsView exposing (userSettingView)

import Components exposing (..)
import Decoders exposing (roomInfoListDecoder)
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (..)
import List.Extra
import Ports exposing (..)
import Regex exposing (..)
import Set
import Types exposing (..)


userSettingView : User -> Model -> { title : String, body : List (Html Msg) }
userSettingView user model =
    { title = user.fullname ++ ": " ++ appName
    , body =
        [ div [ class "container-fluid" ]
            [ div [ class "row" ]
                [ leftMenu model
                , smallMenu
                , div [ class "offset-md-5 offset-lg-2 col-md-7 col-lg-10" ]
                    [ h1 [] [ text <| "設定" ]
                    , div []
                        [ div [] [ span [] [ text "ユーザー名: " ], span [] [ text user.username ] ]
                        , div [] [ span [] [ text "フルネーム: " ], span [] [ text user.fullname ] ]
                        , div [] [ span [] [ text "ID: " ], span [] [ text user.id ] ]
                        , div []
                            [ span [] [ text "Email: ", text <| Maybe.withDefault "（未登録）" <| (.emails >> List.head) user ]
                            ]
                        ]
                    , div [ id "key-settings" ]
                        [ h2 [] [ text "暗号化の設定" ]
                        , div []
                            [ ul []
                                [ li []
                                    [ span [] [ text "公開鍵のFingerprint: " ]
                                    , span [ class "fingerprint" ]
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
                                    , span [ class "fingerprint" ]
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
                            [ text "ユーザー間のメッセージ本文（文章・画像）は楕円曲線ディフィー・ヘルマン鍵共有（ECDH）および128ビットAES-GCMによってエンドツーエンド暗号化されています。\u{3000}※送信日時，送信ユーザー名などのメタデータは暗号化されません。"
                            , br [] []
                            , text "秘密鍵は各ユーザーの端末のみに保存されるため，サーバー管理者はメッセージ本文を読むことができません。"
                            , br [] []
                            , text "同じユーザーが他の端末で使用する場合は，下記より秘密鍵を書き出してから他の端末で読み込むか，あるいは一時的にサーバーに秘密鍵を預けてから他の端末でログインすることで利用が可能になります。"
                            ]
                        , div [ style "margin-bottom" "10px" ]
                            [ span [] [ text "秘密鍵を書き出し" ]
                            , a
                                [ classList [ ( "btn", True ), ( "btn-primary", True ), ( "disabled", model.profile.privateKey == "" ) ], onClick DownloadPrivateKey, download "private_key.json", id "download-private-key" ]
                                [ text "書き出す" ]
                            , br [] []
                            , label [ for "upload-private-key" ]
                                [ text "秘密鍵を取り込み" ]
                            , input
                                [ id "upload-private-key"
                                , type_ "file"
                                ]
                                []
                            , span [] [ text model.profile.privateKeyMsg ]
                            ]
                        , div [ style "margin-bottom" "10px" ] [ button [ class "btn btn-primary", disabled (model.profile.privateKey == ""), onClick UploadPrivateKey ] [ text "鍵をサーバーに預ける" ], br [] [], span [] [ text "サーバーに5分間だけ秘密鍵を保管します。5分間のうちに他の利用端末でログインすると，秘密鍵が自動でダウンロードされ端末に保存されます。" ] ]
                        , div []
                            [ a [ class "btn btn-danger", onClick ResetKeys ] [ text "鍵を生成し直す" ]
                            ]
                        ]
                    ]
                ]
            ]
        ]
    }
