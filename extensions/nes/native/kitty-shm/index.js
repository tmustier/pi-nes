const path = require("node:path");

let native = null;
let loadError = null;
try {
  native = require(path.join(__dirname, "pi_nes_kitty_shm.node"));
} catch (error) {
  loadError = error;
}

const exportsObj = native ? { ...native } : {};
exportsObj.isAvailable = Boolean(native);
exportsObj.loadError = loadError;

module.exports = exportsObj;
