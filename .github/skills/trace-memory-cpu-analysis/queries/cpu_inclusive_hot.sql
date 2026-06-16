-- Hottest INCLUSIVE functions for one process (function anywhere on the stack).
-- Inclusive samples ≈ wall time spent in the function and its callees.
-- Uses perfetto's builtin ancestor table function, so it stays fast even on
-- traces with millions of samples. Replace 37043 with the target pid.
WITH samp AS (
  SELECT s.callsite_id
  FROM cpu_profile_stack_sample s
  JOIN thread t USING (utid)
  JOIN process p USING (upid)
  WHERE p.pid = 37043
),
frames AS (
  -- ancestors of each sampled callsite
  SELECT a.frame_id
  FROM samp
  JOIN experimental_ancestor_stack_profile_callsite(samp.callsite_id) a
  UNION ALL
  -- plus the leaf frame itself
  SELECT c.frame_id
  FROM samp
  JOIN stack_profile_callsite c ON c.id = samp.callsite_id
)
SELECT
  f.name,
  count(*) AS inclusive_samples
FROM frames
JOIN stack_profile_frame f ON f.id = frames.frame_id
WHERE f.name NOT IN ('(idle)', '(program)', '(garbage collector)', '(root)', '')
GROUP BY f.name
ORDER BY inclusive_samples DESC
LIMIT 30;
