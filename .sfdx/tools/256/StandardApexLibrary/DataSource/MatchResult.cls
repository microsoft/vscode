global class MatchResult {
	global String errorMessage;
	global Integer index;
	global List<DataSource.MatchedRecord> matches;
	global Integer size;
	global Boolean success;
	global String tableName;
	global Double topScore;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.MatchResult get(Boolean success, String errorMessage, String tableName, Integer index, Integer size, Double topScore, List<DataSource.MatchedRecord> matches) { }
	global Integer hashCode() { }

}