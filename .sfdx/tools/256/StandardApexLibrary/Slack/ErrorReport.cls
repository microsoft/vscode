global class ErrorReport {
	global static Slack.ErrorReport.Builder builder() { }
	global Object clone() { }
	global String getChannelId() { }
	global String getMessage() { }
	global Slack.ViewReference getMessageView() { }
	global Slack.ViewReference getModalView() { }
	global String getUserId() { }
	global Boolean isEmpty() { }
global class Builder {
	global ErrorReport.Builder() { }
	global Slack.ErrorReport build() { }
	global Slack.ErrorReport.Builder channelId(String channelId) { }
	global Object clone() { }
	global Slack.ErrorReport.Builder message(String message) { }
	global Slack.ErrorReport.Builder messageView(Slack.ViewReference viewReference) { }
	global Slack.ErrorReport.Builder modalView(Slack.ViewReference viewReference) { }
	global Slack.ErrorReport.Builder userId(String userId) { }

}

}