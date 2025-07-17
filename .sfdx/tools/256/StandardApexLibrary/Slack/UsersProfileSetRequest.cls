global class UsersProfileSetRequest {
	global static Slack.UsersProfileSetRequest.Builder builder() { }
	global Object clone() { }
	global String getName() { }
	global String getUser() { }
	global String getValue() { }
	global String toString() { }
global class Builder {
	global UsersProfileSetRequest.Builder() { }
	global Slack.UsersProfileSetRequest build() { }
	global Object clone() { }
	global Slack.UsersProfileSetRequest.Builder name(String name) { }
	global Slack.UsersProfileSetRequest.Builder user(String user) { }
	global Slack.UsersProfileSetRequest.Builder value(String value) { }

}

}