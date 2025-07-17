global class ChatterStreamInput {
	global String description;
	global String name;
	global List<ConnectApi.StreamSubscriptionInput> subscriptionsToAdd;
	global List<ConnectApi.StreamSubscriptionInput> subscriptionsToRemove;
	global ChatterStreamInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}