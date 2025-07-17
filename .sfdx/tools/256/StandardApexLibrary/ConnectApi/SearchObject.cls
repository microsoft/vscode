global class SearchObject {
	global List<String> displayFields;
	global String objectApiName;
	global List<ConnectApi.SearchAppliedOrderBy> orderBy;
	global ConnectApi.PageInfo pageInfo;
	global List<ConnectApi.SearchResult> searchResults;
	global ConnectApi.SpellCorrectionInfo spellCorrectionInfo;
	global ConnectApi.SearchStatus status;
	global SearchObject() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}