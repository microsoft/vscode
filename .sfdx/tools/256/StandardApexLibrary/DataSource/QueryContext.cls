global class QueryContext {
	global String queryMoreToken;
	global DataSource.TableSelection tableSelection;
	global QueryContext() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.QueryContext get(List<DataSource.Table> metadata, Integer startRowNumZeroOffset, Integer maxResults, DataSource.TableSelection tableSelection) { }
	global Integer hashCode() { }

}