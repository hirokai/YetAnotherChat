# 使い方

Node.js v12で動作

## 前提

* Node.js v12
* npm
* PostgreSQL
  * Macの場合 ```brew update && brew install postgresql``` でインストール

## インストール
```
npm i
initdb <PostgreSQLデータを置くフォルダ>
createdb yacht
psql -d yacht -f server/schema.sql
```

## 設定ファイル（プライベート）の準備
`server/private/`に以下の2つのファイルを置く。
* `credential.js`
* `user_info.ts`

## データベースを開始する

```
pg_ctl -D ~/repos/postgres start
```

## サーバーを起動する

```
npm run build
npm run forever
```

`http://localhost/`でアクセス。
