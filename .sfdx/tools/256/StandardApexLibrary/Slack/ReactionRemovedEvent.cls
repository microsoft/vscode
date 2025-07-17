global class ReactionRemovedEvent {
	global ReactionRemovedEvent() { }
	global Object clone() { }
	global String getEventTs() { }
	global Slack.ReactionRemovedEvent.Item getItem() { }
	global String getItemUser() { }
	global String getReaction() { }
	global String getSubtype() { }
	global String getType() { }
	global String getUser() { }
	global void setEventTs(String eventTs) { }
	global void setItem(Slack.ReactionRemovedEvent.Item item) { }
	global void setItemUser(String itemUser) { }
	global void setReaction(String reaction) { }
	global void setUser(String user) { }
	global String toString() { }
global class Item {
	global ReactionRemovedEvent.Item() { }
	global Object clone() { }
	global String getChannel() { }
	global String getFile() { }
	global String getFileComment() { }
	global String getTs() { }
	global String getType() { }
	global void setChannel(String channel) { }
	global void setFile(String file) { }
	global void setFileComment(String fileComment) { }
	global void setTs(String ts) { }
	global void setType(String type) { }

}

}