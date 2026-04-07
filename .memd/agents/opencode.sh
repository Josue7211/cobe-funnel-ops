#!/usr/bin/env bash
set -euo pipefail

export MEMD_BUNDLE_ROOT="/home/josue/Documents/projects/cobe-funnel-ops/.memd"
source "$MEMD_BUNDLE_ROOT/backend.env" 2>/dev/null || true
source "$MEMD_BUNDLE_ROOT/env"
export MEMD_AGENT="opencode"
exec memd resume --output "$MEMD_BUNDLE_ROOT" --intent current_task "$@"
