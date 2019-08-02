# https://elm-lang.org/0.19.0/optimize

cd "$(dirname "$0")"
elm make ./Matrix.elm --output ./dist/matrix.elm.js
elm make ./Main.elm --output ./dist/main.elm.js
