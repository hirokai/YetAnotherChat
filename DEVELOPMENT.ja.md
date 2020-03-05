# 開発方法

## フォルダ構成
```
.
├── client          クライアント（TypeScript/Elm）
│   ├── model       クライアントモデル（TypeScript）
│   └── view        ビュー（Elm）
├── common          クライアント・サーバー共通コード
├── migration       データベースマイグレーション
├── other           その他のスクリプト
├── public          クライアント用静的リソース（HTML, JS, CSS, 画像）
│   ├── about
│   │   └── status
│   ├── css
│   ├── html
│   ├── img
│   │   ├── SDGs
│   │   └── letter
│   └── js          TypeScript、Elmからビルド・バンドルされたJS
└── server          サーバー（TypeScript）
    ├── api         サーバーREST API
    ├── model       サーバーモデル
    └── view        サーバーサイドレンダリングのテンプレート
```

## デバッグ用サーバーの起動
ターミナルを二つ開き、
```
npm run server:watch
```

```
npm run client:watch
```
をそれぞれ実行。

変更を自動検出して再ビルドが行われる。自動リロードは起こらない。
