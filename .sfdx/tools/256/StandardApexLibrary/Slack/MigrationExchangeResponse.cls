global class MigrationExchangeResponse {
	global MigrationExchangeResponse() { }
	global Object clone() { }
	global String getEnterpriseId() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global List<String> getInvalidUserIds() { }
	global String getNeeded() { }
	global String getProvided() { }
	global String getTeamId() { }
	global Map<String,String> getUserIdMap() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global void setEnterpriseId(String enterpriseId) { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setInvalidUserIds(List<String> invalidUserIds) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setTeamId(String teamId) { }
	global void setUserIdMap(Map<String,String> userIdMap) { }
	global void setWarning(String warning) { }
	global String toString() { }

}