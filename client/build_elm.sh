# https://elm-lang.org/0.19.0/optimize

elm make --optimize ./Matrix.elm --output ./dist/matrix.elm.temp.js
elm make --optimize ./Main.elm --output ./dist/main.elm.temp.js

npx uglifyjs ./dist/matrix.elm.temp.js --compress "pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,keep_fargs=false,unsafe_comps,unsafe" | npx uglifyjs --mangle --output=./dist/matrix.elm.js
npx uglifyjs ./dist/main.elm.temp.js --compress "pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,keep_fargs=false,unsafe_comps,unsafe" | npx uglifyjs --mangle --output=./dist/main.elm.js
