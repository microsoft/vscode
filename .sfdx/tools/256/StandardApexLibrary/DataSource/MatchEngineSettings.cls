global class MatchEngineSettings {
	global Set<String> matchableFields;
	global Integer maxBatchSize;
	global Integer maxMatchResults;
	global Integer minMatchConfidenceThreshold;
	global MatchEngineSettings(Integer maxBatchSize, Integer maxMatchResults, Integer minMatchConfidenceThreshold, Set<String> matchableFields) { }
	global MatchEngineSettings(Integer maxBatchSize, Integer maxMatchResults, Integer minMatchConfidenceThreshold) { }
	global Object clone() { }

}