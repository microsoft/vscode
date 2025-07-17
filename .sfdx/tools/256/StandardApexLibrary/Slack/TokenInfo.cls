global class TokenInfo {
	global TokenInfo() { }
	global Object clone() { }
	global Set<String> getTokenScopes() { }
	global Slack.TokenType getTokenType() { }
	global void setTokenScopes(Set<String> tokenScopes) { }
	global void setTokenType(Slack.TokenType tokenType) { }

}