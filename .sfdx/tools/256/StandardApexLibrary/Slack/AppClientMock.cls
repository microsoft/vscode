global class AppClientMock {
	global AppClientMock() { }
	global Slack.AppsEventAuthorizationsListResponse appsEventAuthorizationsList(Slack.AppsEventAuthorizationsListRequest req) { }
	global Slack.AuthTestResponse authTest(Slack.AuthTestRequest req) { }
	global Object clone() { }

}