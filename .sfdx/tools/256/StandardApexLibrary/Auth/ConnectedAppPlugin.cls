global class ConnectedAppPlugin {
	global ConnectedAppPlugin() { }
	global Boolean authorize(Id userId, Id connectedAppId, Boolean isAdminApproved, Auth.InvocationContext context) { }
	global Boolean authorize(Id userId, Id connectedAppId, Boolean isAdminApproved) { }
	global Object clone() { }
	global Map<String,String> customAttributes(Id userId, Id connectedAppId, Map<String,String> formulaDefinedAttributes, Auth.InvocationContext context) { }
	global Map<String,String> customAttributes(Id userId, Map<String,String> formulaDefinedAttributes) { }
	global dom.XmlNode modifySAMLResponse(Map<String,String> authSession, Id connectedAppId, dom.XmlNode samlResponse) { }
	global void refresh(Id userId, Id connectedAppId, Auth.InvocationContext context) { }
	global void refresh(Id userId, Id connectedAppId) { }

}