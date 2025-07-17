global class ExternalClientAppOauthHandler {
	global ExternalClientAppOauthHandler() { }
	global Boolean authorize(Id userId, Id ecAppId, Boolean isAdminApproved, Auth.InvocationContext context) { }
	global Object clone() { }
	global Map<String,String> customAttributes(Id userId, Id ecAppId, Map<String,String> formulaDefinedAttributes, Auth.InvocationContext context) { }
	global void refresh(Id userId, Id ecAppId, Auth.InvocationContext context) { }

}