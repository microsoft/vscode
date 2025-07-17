global class UsersProfileGetRequest {
	global static Slack.UsersProfileGetRequest.Builder builder() { }
	global Object clone() { }
	global String getUser() { }
	global Boolean isIncludeLabels() { }
	global String toString() { }
global class Builder {
	global UsersProfileGetRequest.Builder() { }
	global Slack.UsersProfileGetRequest build() { }
	global Object clone() { }
	global Slack.UsersProfileGetRequest.Builder includeLabels(Boolean includeLabels) { }
	global Slack.UsersProfileGetRequest.Builder user(String user) { }

}

}