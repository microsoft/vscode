global class ObjectQueryInfo {
	global List<String> displayFields;
	global Boolean hasMoreResults;
	global Integer numberOfMatches;
	global List<ConnectApi.SearchAppliedOrderBy> orderBy;
	global String source;
	global ConnectApi.SpellCorrectionInfo spellCorrectionInfo;
	global ConnectApi.SearchStatus status;
	global ObjectQueryInfo() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}