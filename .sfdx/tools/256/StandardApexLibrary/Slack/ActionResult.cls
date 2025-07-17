global class ActionResult {
	global Object clone() { }
	global static Slack.ActionResult error(Exception _exception, Slack.ErrorReport errorReport) { }
	global static Slack.ActionResult error(Exception _exception) { }
	global Exception getException() { }
	global Boolean isOk() { }
	global static Slack.ActionResult ok() { }

}