global class SearchRequest {
	global String configurationName;
	global List<ConnectApi.SearchDataCategory> dataCategories;
	global List<String> displayFields;
	global List<ConnectApi.SearchFilter> filters;
	global Boolean highlights;
	global Integer offset;
	global List<ConnectApi.SearchOrderBy> orderBy;
	global Integer pageSize;
	global String q;
	global Boolean spellcheck;
	global SearchRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}