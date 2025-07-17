global class TokensRevokedEvent {
	global TokensRevokedEvent() { }
	global Object clone() { }
	global String getSubtype() { }
	global Slack.TokensRevokedEvent.Tokens getTokens() { }
	global String getType() { }
	global void setTokens(Slack.TokensRevokedEvent.Tokens tokens) { }
	global String toString() { }
global class Tokens {
	global TokensRevokedEvent.Tokens() { }
	global Object clone() { }
	global List<String> getBot() { }
	global List<String> getOauth() { }
	global void setBot(List<String> bot) { }
	global void setOauth(List<String> oauth) { }

}

}