global class ChatterGroupInput {
	global String announcement;
	global Boolean canHaveChatterGuests;
	global String description;
	global ConnectApi.GroupInformationInput information;
	global Boolean isArchived;
	global Boolean isAutoArchiveDisabled;
	global Boolean isBroadcast;
	global String name;
	global String owner;
	global ConnectApi.GroupVisibilityType visibility;
	global ChatterGroupInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}