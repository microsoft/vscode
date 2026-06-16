-- Hottest SELF (leaf) functions for one process.
-- Self time = samples whose innermost frame is this function.
-- Replace 37043 with the target pid (e.g. the max-memory process from
-- `analyze_memory.py rank`).
SELECT
  f.name,
  count(*) AS self_samples
FROM cpu_profile_stack_sample s
JOIN thread t USING (utid)
JOIN process p USING (upid)
JOIN stack_profile_callsite c ON s.callsite_id = c.id
JOIN stack_profile_frame f ON c.frame_id = f.id
WHERE p.pid = 37043
GROUP BY f.name
ORDER BY self_samples DESC
LIMIT 30;
