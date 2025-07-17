global class UserChangeEvent {
	global UserChangeEvent() { }
	global Object clone() { }
	global Integer getCacheTs() { }
	global String getSubtype() { }
	global String getType() { }
	global Slack.User getUser() { }
	global void setCacheTs(Integer cacheTs) { }
	global void setUser(Slack.User user) { }
	global String toString() { }

}