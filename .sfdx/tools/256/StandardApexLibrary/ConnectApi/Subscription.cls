global class Subscription {
	global ConnectApi.Reference community;
	global String id;
	global ConnectApi.ActorWithId subject;
	global ConnectApi.ActorWithId subscriber;
	global String url;
	global Subscription() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}