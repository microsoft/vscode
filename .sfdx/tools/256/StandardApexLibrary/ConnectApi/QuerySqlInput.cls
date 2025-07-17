global class QuerySqlInput {
	global Integer adaptiveTimeout;
	global Map<String,String> querySettings;
	global Long rowLimit;
	global String sql;
	global List<ConnectApi.QuerySqlParameterItem> sqlParameters;
	global QuerySqlInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}