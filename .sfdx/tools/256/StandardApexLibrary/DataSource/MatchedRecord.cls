global class MatchedRecord {
	global Map<String,String> additionalInformation;
	global Map<String,Object> data;
	global List<String> diffs;
	global Double score;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.MatchedRecord get(Map<String,Object> data, Double score, List<String> diffs, Map<String,String> additionalInformation) { }
	global Integer hashCode() { }

}