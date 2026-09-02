#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-/Users/apple/.codex/pets/einstein/spritesheet.webp}"
OUTPUT_DIR="${2:-$SCRIPT_DIR/assets/pet/einstein}"

if [ ! -f "$SOURCE" ]; then
  echo "Source spritesheet not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Pet name doubles as the MTMR alternativeImages prefix, so it follows the
# output directory name (assets/pet/einstein -> einstein, assets/pet/deepseek
# -> deepseek). All known pet atlases share the 1536x1872 layout: nine rows
# of 208px height, with each frame occupying a 192px slot. Rows may contain
# fewer than eight frames; the unused slots are transparent.
FRAME_COUNTS=(6 8 8 4 5 8 6 6 6)
PET_NAME="$(basename "$OUTPUT_DIR")"

for row in "${!FRAME_COUNTS[@]}"; do
  count="${FRAME_COUNTS[$row]}"
  for ((frame = 0; frame < count; frame += 1)); do
    output="$OUTPUT_DIR/${PET_NAME}-r${row}-${frame}.png"
    y_offset=$((row * 208))
    x_offset=$(((frame + 1) * 192))
    sips \
      --cropToHeightWidth 208 192 \
      --cropOffset "$y_offset" "$x_offset" \
      --setProperty format png \
      --out "$output" \
      "$SOURCE" >/dev/null
  done
done

echo "Extracted ${PET_NAME} frames to $OUTPUT_DIR"
