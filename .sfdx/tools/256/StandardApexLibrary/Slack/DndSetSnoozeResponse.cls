global class DndSetSnoozeResponse {
	global DndSetSnoozeResponse() { }
	global Object clone() { }
	global String getError() { }
	global Map<String,List<String>> getHttpResponseHeaders() { }
	global String getNeeded() { }
	global String getProvided() { }
	global Integer getSnoozeEndtime() { }
	global Integer getSnoozeRemaining() { }
	global String getWarning() { }
	global Boolean isOk() { }
	global Boolean isSnoozeEnabled() { }
	global Boolean isSnoozeIsIndefinite() { }
	global void setError(String error) { }
	global void setHttpResponseHeaders(Map<String,List<String>> httpResponseHeaders) { }
	global void setNeeded(String needed) { }
	global void setOk(Boolean ok) { }
	global void setProvided(String provided) { }
	global void setSnoozeEnabled(Boolean snoozeEnabled) { }
	global void setSnoozeEndtime(Integer snoozeEndtime) { }
	global void setSnoozeIsIndefinite(Boolean snoozeIsIndefinite) { }
	global void setSnoozeRemaining(Integer snoozeRemaining) { }
	global void setWarning(String warning) { }
	global String toString() { }

}