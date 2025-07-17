global class TeamIntegrationLogsRequest {
	global static Slack.TeamIntegrationLogsRequest.Builder builder() { }
	global Object clone() { }
	global String getAppId() { }
	global String getChangeType() { }
	global Integer getCount() { }
	global Integer getPage() { }
	global String getServiceId() { }
	global String getTeamId() { }
	global String getUser() { }
	global String toString() { }
global class Builder {
	global TeamIntegrationLogsRequest.Builder() { }
	global Slack.TeamIntegrationLogsRequest.Builder appId(String appId) { }
	global Slack.TeamIntegrationLogsRequest build() { }
	global Slack.TeamIntegrationLogsRequest.Builder changeType(String changeType) { }
	global Object clone() { }
	global Slack.TeamIntegrationLogsRequest.Builder count(Integer count) { }
	global Slack.TeamIntegrationLogsRequest.Builder page(Integer page) { }
	global Slack.TeamIntegrationLogsRequest.Builder serviceId(String serviceId) { }
	global Slack.TeamIntegrationLogsRequest.Builder teamId(String teamId) { }
	global Slack.TeamIntegrationLogsRequest.Builder user(String user) { }

}

}