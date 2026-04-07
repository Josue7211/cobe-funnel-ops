# memd imports for Claude Code

Use this file as the single import target from your project `CLAUDE.md`.

Add this line to the root `CLAUDE.md` for the workspace:

`@.memd/agents/CLAUDE_IMPORTS.md`

Then run `/memory` inside Claude Code to verify the imported memd files are loaded.

## Imported memd memory files

@../MEMD_MEMORY.md
@CLAUDE_CODE_MEMORY.md

## Notes

- `memd resume --output /home/josue/Documents/projects/cobe-funnel-ops/.memd --intent current_task` refreshes the hot short-term lane.
- `memd checkpoint --output /home/josue/Documents/projects/cobe-funnel-ops/.memd --content "..."` writes short-term state back into the same lane.
- `memd handoff --output /home/josue/Documents/projects/cobe-funnel-ops/.memd --prompt` refreshes the shared handoff view.
- dream and autodream output should flow back through `memd`, then Claude should pick it up through this import chain.
- keep `memd` as the source of truth; treat this Claude import surface as a generated bridge.
