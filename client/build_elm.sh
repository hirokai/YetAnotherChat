# https://elm-lang.org/0.19.0/optimize

elm make --optimize src/Matrix.elm --output dist/matrix.elm.js
elm make --optimize src/Main.elm --output dist/main.elm.js

uglifyjs dist/matrix.elm.js --compress "pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,keep_fargs=false,unsafe_comps,unsafe" | uglifyjs --mangle --output=./public/js/matrix.elm.min.js

uglifyjs dist/main.elm.js --compress "pure_funcs=[F2,F3,F4,F5,F6,F7,F8,F9,A2,A3,A4,A5,A6,A7,A8,A9],pure_getters,keep_fargs=false,unsafe_comps,unsafe" | uglifyjs --mangle --output=./public/js/main.elm.min.js

cp -r public/ ../server/public
mkdir -p ../server/public/html/
cp matrix.html ../server/public/html/
cp main.html ../server/public/html/