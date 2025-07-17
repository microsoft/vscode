global class AppAnalytics {
	global AppAnalytics() { }
	global Object clone() { }
	global static void logCustomInteraction(Object interactionLabel, Id interactionId) { }
	global static void logCustomInteraction(Object interactionLabel, System.UUID interactionUuid) { }
	global static void logCustomInteraction(Object interactionLabel) { }

}