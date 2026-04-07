# 14-02 Summary

## Completed
- Added routing visibility in Recovery: owner, lane, and rule label now derive from booking, lead, queue, and timeline context.
- Added no-show escalation surfacing by summarizing timeline signals and normalizing queue metadata into actionable UI output.
- Kept recovery UI compact with a dedicated three-card routing block plus escalation signal list.
- Preserved and reused existing 14-01 recovery model data sources, without changing server contracts.

## Files Changed
- `src/App.tsx`
- `src/App.css`

## Notes
- `src/App.css` was reduced to only routing/escalation additions needed for this milestone to avoid unrelated style churn.
