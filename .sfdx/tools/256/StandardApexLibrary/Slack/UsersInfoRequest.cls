global class UsersInfoRequest {
	global static Slack.UsersInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getUser() { }
	global Boolean isIncludeLocale() { }
	global String toString() { }
global class Builder {
	global UsersInfoRequest.Builder() { }
	global Slack.UsersInfoRequest build() { }
	global Object clone() { }
	global Slack.UsersInfoRequest.Builder includeLocale(Boolean includeLocale) { }
	global Slack.UsersInfoRequest.Builder user(String user) { }

}

}