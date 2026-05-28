import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const cfg = {
  entryPoints: [
    "extension/src/background.js",
    "extension/src/content.js",
    "extension/src/options.js",
    "extension/src/popup.js",
  ],
  outdir: "extension/dist",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome110"],
  logLevel: "info",
};

if (isWatch) {
  const ctx = await esbuild.context(cfg);
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  await esbuild.build(cfg);
}
