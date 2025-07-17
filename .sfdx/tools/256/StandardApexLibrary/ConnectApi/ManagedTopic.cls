global class ManagedTopic {
	global List<ConnectApi.ManagedTopic> children;
	global String id;
	global ConnectApi.ManagedTopicType managedTopicType;
	global ConnectApi.Reference parent;
	global ConnectApi.Topic topic;
	global String url;
	global ManagedTopic() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}