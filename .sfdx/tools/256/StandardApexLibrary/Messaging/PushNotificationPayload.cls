global class PushNotificationPayload {
	global PushNotificationPayload() { }
	global static Map<String,Object> apple(String alertBody, String actionLocKey, String locKey, List<String> locArgs, String launchImage, String sound, Integer badgeCount, Map<String,Object> userData) { }
	global static Map<String,Object> apple(String alert, String sound, Integer badgeCount, Map<String,Object> userData) { }
	global Object clone() { }

}