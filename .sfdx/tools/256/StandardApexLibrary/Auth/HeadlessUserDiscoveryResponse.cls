global class HeadlessUserDiscoveryResponse {
	global String customErrorMessage;
	global Set<Id> userIds;
	global HeadlessUserDiscoveryResponse(Set<Id> userIds, String customErrorMessage) { }
	global Object clone() { }

}