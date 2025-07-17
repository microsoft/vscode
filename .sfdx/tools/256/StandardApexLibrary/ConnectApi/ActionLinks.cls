global class ActionLinks {
	global Object clone() { }
	global static ConnectApi.ActionLinkGroupDefinition createActionLinkGroupDefinition(String communityId, ConnectApi.ActionLinkGroupDefinitionInput actionLinkGroup) { }
	global static void deleteActionLinkGroupDefinition(String communityId, String actionLinkGroupId) { }
	global static ConnectApi.PlatformAction getActionLink(String communityId, String actionLinkId) { }
	global static ConnectApi.ActionLinkDiagnosticInfo getActionLinkDiagnosticInfo(String communityId, String actionLinkId) { }
	global static ConnectApi.PlatformActionGroup getActionLinkGroup(String communityId, String actionLinkGroupId) { }
	global static ConnectApi.ActionLinkGroupDefinition getActionLinkGroupDefinition(String communityId, String actionLinkGroupId) { }

}