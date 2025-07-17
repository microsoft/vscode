global class App {
	global Object clone() { }
	global static Slack.App getAppByKey(String key) { }
	global static Slack.App getAppByName(String developerName) { }
	global Slack.AppClient getAppClient() { }
	global String getAppKey() { }
	global Slack.BotClient getBotClientForTeam(String teamId) { }
	global String getConnectedSalesforceUserId(String teamId, String slackUserId) { }
	global Map<String,String> getConnectedSalesforceUserIdMap(String teamId, List<String> slackUserIds) { }
	global String getConnectedSlackUserId(String teamId, String salesforceUserId) { }
	global Map<String,String> getConnectedSlackUserIdMap(String teamId, List<String> salesforceUserIds) { }
	global Slack.UserClient getUserClientForTeam(String teamId, String slackUserId) { }

}