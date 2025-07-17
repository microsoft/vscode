global class PushNotification {
	global PushNotification(Map<String,Object> payload) { }
	global PushNotification() { }
	global Object clone() { }
	global void send(String application, Set<String> users) { }
	global void setPayload(Map<String,Object> payload) { }
	global void setTtl(Integer ttl) { }

}