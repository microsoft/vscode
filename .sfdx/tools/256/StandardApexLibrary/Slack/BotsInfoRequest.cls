global class BotsInfoRequest {
	global static Slack.BotsInfoRequest.Builder builder() { }
	global Object clone() { }
	global String getBot() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global BotsInfoRequest.Builder() { }
	global Slack.BotsInfoRequest.Builder bot(String bot) { }
	global Slack.BotsInfoRequest build() { }
	global Object clone() { }
	global Slack.BotsInfoRequest.Builder teamId(String teamId) { }

}

}