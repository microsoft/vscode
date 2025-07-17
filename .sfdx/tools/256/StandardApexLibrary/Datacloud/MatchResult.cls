global class MatchResult {
	global String entitytype;
	global List<Database.Error> errors;
	global String matchengine;
	global List<Datacloud.MatchRecord> matchrecords;
	global String rule;
	global Integer size;
	global Boolean success;
	global Boolean equals(Object obj) { }
	global String getEntityType() { }
	global List<Database.Error> getErrors() { }
	global String getMatchEngine() { }
	global List<Datacloud.MatchRecord> getMatchRecords() { }
	global String getRule() { }
	global Integer getSize() { }
	global Integer hashCode() { }
	global Boolean isSuccess() { }
	global String toString() { }

}