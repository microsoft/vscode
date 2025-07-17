global class AppRateLimitedEvent {
	global AppRateLimitedEvent() { }
	global Object clone() { }
	global String getApiAppId() { }
	global Integer getMinuteRateLimited() { }
	global String getSubtype() { }
	global String getTeamId() { }
	global String getType() { }
	global void setApiAppId(String apiAppId) { }
	global void setMinuteRateLimited(Integer minuteRateLimited) { }
	global void setTeamId(String teamId) { }
	global String toString() { }

}