global class CustomNotification {
	global CustomNotification(String typeId, String sender, String title, String body, String targetId, String targetPageRef) { }
	global CustomNotification() { }
	global Object clone() { }
	global void send(Set<String> users) { }
	global void setBody(String body) { }
	global void setNotificationTypeId(String id) { }
	global void setSenderId(String id) { }
	global void setTargetId(String targetId) { }
	global void setTargetPageRef(String pageRef) { }
	global void setTitle(String title) { }

}