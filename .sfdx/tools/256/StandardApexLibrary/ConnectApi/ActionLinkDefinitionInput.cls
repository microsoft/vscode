global class ActionLinkDefinitionInput {
	global ConnectApi.ActionLinkType actionType;
	global String actionUrl;
	global String excludedUserId;
	global Boolean groupDefault;
	global List<ConnectApi.RequestHeaderInput> headers;
	global String labelKey;
	global ConnectApi.HttpRequestMethod method;
	global String requestBody;
	global Boolean requiresConfirmation;
	global String userId;
	global ActionLinkDefinitionInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}