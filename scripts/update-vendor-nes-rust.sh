#!/usr/bin/env bash
set -euo pipefail

FORK_URL="https://github.com/tmustier/nes-rust.git"
VENDOR_DIR="extensions/nes/native/nes-core/vendor/nes_rust"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree not clean. Commit or stash changes before updating vendor." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d -t nes-rust-vendor-XXXX)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

git clone --depth 1 "$FORK_URL" "$TMP_DIR"

echo "This will replace contents of $VENDOR_DIR with $FORK_URL"
read -r -p "Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

rsync -a --delete --exclude ".git" "$TMP_DIR/" "$VENDOR_DIR/"

echo "Vendored from commit: $(git -C "$TMP_DIR" rev-parse HEAD)"
echo "Update $VENDOR_DIR/VENDOR.md with commit/tag + date + patch summary."
