global class AppsUninstallRequest {
	global static Slack.AppsUninstallRequest.Builder builder() { }
	global Object clone() { }
	global String getClientId() { }
	global String getClientSecret() { }
	global String toString() { }
global class Builder {
	global AppsUninstallRequest.Builder() { }
	global Slack.AppsUninstallRequest build() { }
	global Slack.AppsUninstallRequest.Builder clientId(String clientId) { }
	global Slack.AppsUninstallRequest.Builder clientSecret(String clientSecret) { }
	global Object clone() { }

}

}