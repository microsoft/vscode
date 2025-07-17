global class DagsSearchOptions {
	global String filterGroup;
	global String lastModifiedAfter;
	global String lastModifiedBefore;
	global String orderBy;
	global String page;
	global Integer pageSize;
	global String q;
	global String sortParam;
	global List<String> status;
	global DagsSearchOptions() { }
	global Object clone() { }

}