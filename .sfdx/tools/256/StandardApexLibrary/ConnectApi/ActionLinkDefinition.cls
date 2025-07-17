global class ActionLinkDefinition {
	global String actionUrl;
	global Datetime createdDate;
	global String excludedUserId;
	global Boolean groupDefault;
	global List<ConnectApi.RequestHeader> headers;
	global String id;
	global String label;
	global String labelKey;
	global ConnectApi.HttpRequestMethod method;
	global Datetime modifiedDate;
	global String requestBody;
	global Boolean requiresConfirmation;
	global String templateId;
	global ConnectApi.ActionLinkType type;
	global String userId;
	global ActionLinkDefinition() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}