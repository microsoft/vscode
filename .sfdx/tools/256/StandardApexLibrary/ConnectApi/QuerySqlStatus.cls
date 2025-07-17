global class QuerySqlStatus {
	global Long chunkCount;
	global ConnectApi.QuerySqlStatusEnum completionStatus;
	global String expirationTime;
	global Double progress;
	global String queryId;
	global Long rowCount;
	global QuerySqlStatus() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}