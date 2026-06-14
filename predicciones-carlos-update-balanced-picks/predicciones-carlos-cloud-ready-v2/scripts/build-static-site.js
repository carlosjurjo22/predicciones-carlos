"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist");

const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "robots.txt",
  "_headers",
  ".nojekyll",
];

const publicDirs = [
  "assets",
  "data",
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of publicFiles) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) {
    copyFile(source, path.join(out, file));
  }
}

for (const dir of publicDirs) {
  const source = path.join(root, dir);
  if (fs.existsSync(source)) {
    copyDir(source, path.join(out, dir));
  }
}

console.log(`Sitio estatico listo en ${path.relative(root, out)}`);

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else if (entry.isFile()) {
      copyFile(sourcePath, targetPath);
    }
  }
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
