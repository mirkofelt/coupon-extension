import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const OUT_DIR = "dist/safari-extension";
const JS_OUT_DIR = path.join(OUT_DIR, "dist");

const isWatch = process.argv.includes("--watch");

function assembleExtension() {
  fs.mkdirSync(JS_OUT_DIR, { recursive: true });

  // Manifest: inject browser_specific_settings for Safari
  const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
  manifest.browser_specific_settings = {
    safari: {
      // alarms API requires Safari 16.4+; MV3 service worker requires 15.4+
      minimum_safari_version: "16.4",
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  // HTML pages
  for (const file of ["popup.html", "options.html"]) {
    fs.copyFileSync(`extension/${file}`, path.join(OUT_DIR, file));
  }

  // Icons
  const iconsDir = path.join(OUT_DIR, "icons");
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const file of fs.readdirSync("extension/icons")) {
    fs.copyFileSync(path.join("extension/icons", file), path.join(iconsDir, file));
  }
}

const cfg = {
  entryPoints: [
    "extension/src/background.js",
    "extension/src/content.js",
    "extension/src/options.js",
    "extension/src/popup.js",
  ],
  outdir: JS_OUT_DIR,
  bundle: true,
  minify: true,
  format: "iife",
  // Safari 16.4 is the minimum for alarms API in MV3
  target: ["safari16"],
  logLevel: "info",
};

assembleExtension();

if (isWatch) {
  const ctx = await esbuild.context({
    ...cfg,
    plugins: [
      {
        name: "safari-assemble",
        setup(build) {
          build.onEnd(() => assembleExtension());
        },
      },
    ],
  });
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  await esbuild.build(cfg);
  console.log(`Safari extension assembled → ${OUT_DIR}/`);
  runXcrun();
}

function runXcrun() {
  if (process.platform !== "darwin") {
    console.log("Skipping xcrun (not on macOS). To convert on macOS, run:");
    console.log(`  xcrun safari-web-extension-converter ${OUT_DIR} --project-location safari-xcode --app-name CouponAlert`);
    return;
  }

  const xcrunCheck = spawnSync("xcrun", ["--find", "safari-web-extension-converter"], { encoding: "utf8" });
  if (xcrunCheck.status !== 0) {
    console.warn("xcrun safari-web-extension-converter not found.");
    console.warn("Install Xcode from the Mac App Store and run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer");
    process.exit(1);
  }

  console.log("Running xcrun safari-web-extension-converter…");
  const result = spawnSync(
    "xcrun",
    [
      "safari-web-extension-converter",
      OUT_DIR,
      "--project-location", "safari-xcode",
      "--app-name", "CouponAlert",
      "--no-prompt",
    ],
    { stdio: "inherit" }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log("Xcode project generated in safari-xcode/. Open it in Xcode, build, and run.");
}
