"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "data", "matches.json");
const jsPath = path.join(root, "data", "matches.js");

const raw = fs.readFileSync(jsonPath, "utf8");
const data = JSON.parse(raw);
const output = `window.PC_MATCHES = ${JSON.stringify(data, null, 2)};\n`;

fs.writeFileSync(jsPath, output, "utf8");
console.log(`Sincronizado ${path.relative(root, jsPath)} desde ${path.relative(root, jsonPath)}`);
