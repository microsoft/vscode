global class AuthTeamsListRequest {
	global static Slack.AuthTeamsListRequest.Builder builder() { }
	global Object clone() { }
	global String getCursor() { }
	global Boolean getIncludeIcon() { }
	global Integer getLimit() { }
	global String toString() { }
global class Builder {
	global AuthTeamsListRequest.Builder() { }
	global Slack.AuthTeamsListRequest build() { }
	global Object clone() { }
	global Slack.AuthTeamsListRequest.Builder cursor(String cursor) { }
	global Slack.AuthTeamsListRequest.Builder includeIcon(Boolean includeIcon) { }
	global Slack.AuthTeamsListRequest.Builder limitValue(Integer limitValue) { }

}

}