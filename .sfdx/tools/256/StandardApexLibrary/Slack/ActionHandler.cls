global class ActionHandler {
	global static Slack.ActionHandler ack(Slack.CallableHandler handler) { }
	global static Slack.ActionHandler ack(Slack.RunnableHandler handler) { }
	global static Slack.ActionHandler clearModal(Slack.CallableHandler handler) { }
	global static Slack.ActionHandler clearModal(Slack.RunnableHandler handler) { }
	global Object clone() { }
	global static Slack.ActionHandler modal(Slack.ModalHandler handler, String stagedModalTitle) { }
	global static Slack.ActionHandler modal(Slack.ModalHandler handler) { }
	global static Slack.ActionHandler pushModal(Slack.ModalHandler handler, String stagedModalTitle) { }
	global static Slack.ActionHandler pushModal(Slack.ModalHandler handler) { }
	global static Slack.ActionHandler updateModal(Slack.ModalHandler handler, String stagedModalTitle) { }
	global static Slack.ActionHandler updateModal(Slack.ModalHandler handler) { }

}