-- Per-process CPU sample distribution and process names.
-- Works on Chrome JSON traces from Electron contentTracing (cpu_profiler category).
SELECT
  p.pid,
  p.name AS process,
  count(*) AS cpu_samples
FROM cpu_profile_stack_sample s
JOIN thread t USING (utid)
JOIN process p USING (upid)
GROUP BY p.upid
ORDER BY cpu_samples DESC;
