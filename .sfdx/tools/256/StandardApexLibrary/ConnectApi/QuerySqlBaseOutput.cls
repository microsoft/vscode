global class QuerySqlBaseOutput {
	global List<ConnectApi.QuerySqlRow> dataRows;
	global List<ConnectApi.QuerySqlMetadataItem> metadata;
	global Long returnedRows;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}