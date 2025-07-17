global class MigrationExchangeRequest {
	global static Slack.MigrationExchangeRequest.Builder builder() { }
	global Object clone() { }
	global String getTeamId() { }
	global List<String> getUsers() { }
	global Boolean isToOld() { }
	global String toString() { }
global class Builder {
	global MigrationExchangeRequest.Builder() { }
	global Slack.MigrationExchangeRequest build() { }
	global Object clone() { }
	global Slack.MigrationExchangeRequest.Builder teamId(String teamId) { }
	global Slack.MigrationExchangeRequest.Builder toOld(Boolean toOld) { }
	global Slack.MigrationExchangeRequest.Builder users(List<String> users) { }

}

}