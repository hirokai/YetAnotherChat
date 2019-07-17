const { FuseBox, WebIndexPlugin, UglifyJSPlugin } = require("fuse-box");
const { ElmPlugin } = require("fuse-box-elm-plugin");

const fuse = FuseBox.init({
  homeDir: "",
  target: "browser@es6",
  output: "public/js/$name.js",
  useTypescriptCompiler: true,
  log: {
    showBundledFiles: true,
    clearTerminalOnBundle: false,
  },
  plugins: [
    this.isProduction &&
    QuantumPlugin({
      uglify: true,
      treeshake: true,
      bakeApiIntoBundle: "app",
    }),],
});
fuse.dev(); // launch http server
fuse
  .bundle("main.bundle")
  .instructions("> client/main.js")
  .watch();
fuse
  .bundle("matrix.bundle")
  .instructions("> client/matrix.js")
  .watch();
fuse.run();
