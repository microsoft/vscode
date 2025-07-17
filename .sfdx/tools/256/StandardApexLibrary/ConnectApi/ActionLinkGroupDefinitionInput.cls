global class ActionLinkGroupDefinitionInput {
	global List<ConnectApi.ActionLinkDefinitionInput> actionLinks;
	global ConnectApi.PlatformActionGroupCategory category;
	global ConnectApi.ActionLinkExecutionsAllowed executionsAllowed;
	global Datetime expirationDate;
	global List<ConnectApi.ActionLinkTemplateBindingInput> templateBindings;
	global String templateId;
	global ActionLinkGroupDefinitionInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}