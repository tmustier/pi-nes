const path = require("node:path");

let native = null;
let loadError = null;
const candidates = ["index.node", "pi_nes_kitty_shm.node"];
for (const filename of candidates) {
  try {
    native = require(path.join(__dirname, filename));
    loadError = null;
    break;
  } catch (error) {
    loadError = error;
  }
}

const exportsObj = native ? { ...native } : {};
exportsObj.isAvailable = Boolean(native);
exportsObj.loadError = loadError;

module.exports = exportsObj;
