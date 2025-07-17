global class ActionLinkGroupDefinition {
	global List<ConnectApi.ActionLinkDefinition> actionLinks;
	global ConnectApi.PlatformActionGroupCategory category;
	global Datetime createdDate;
	global ConnectApi.ActionLinkExecutionsAllowed executionsAllowed;
	global Datetime expirationDate;
	global String id;
	global Datetime modifiedDate;
	global String templateId;
	global String url;
	global ActionLinkGroupDefinition() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}