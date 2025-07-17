global class AppsEventAuthorizationsListRequest {
	global static Slack.AppsEventAuthorizationsListRequest.Builder builder() { }
	global Object clone() { }
	global String getCursor() { }
	global String getEventContext() { }
	global Integer getLimit() { }
	global String toString() { }
global class Builder {
	global AppsEventAuthorizationsListRequest.Builder() { }
	global Slack.AppsEventAuthorizationsListRequest build() { }
	global Object clone() { }
	global Slack.AppsEventAuthorizationsListRequest.Builder cursor(String cursor) { }
	global Slack.AppsEventAuthorizationsListRequest.Builder eventContext(String eventContext) { }
	global Slack.AppsEventAuthorizationsListRequest.Builder limitValue(Integer limitValue) { }

}

}