global class Filter {
	global String columnName;
	global Object columnValue;
	global List<DataSource.Filter> subfilters;
	global String tableName;
	global DataSource.FilterType type;
	global Filter(DataSource.FilterType type, String tableName, String columnName, Object columnValue) { }
	global Filter() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }

}