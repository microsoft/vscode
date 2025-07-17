global class SearchContext {
	global String searchPhrase;
	global List<DataSource.TableSelection> tableSelections;
	global SearchContext(List<DataSource.Table> metadata, Integer offset, Integer maxResults, List<DataSource.TableSelection> tableSelections, String searchPhrase) { }
	global SearchContext() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }

}