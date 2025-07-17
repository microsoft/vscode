global class C2CToken {
	global C2CToken() { }
	global Object clone() { }
	global static void grantSelfTrustRelationship(String integrationName) { }
	global static void grantTrustRelationship(String trustedOrgId, String integrationName) { }
	global static String mintJwt(String audienceId, String integrationName) { }
	global static String mintJwt(String audienceId) { }
	global static String mintJwtForService(String audienceId, String integrationName, Map<String,String> customClaims) { }
	global static String mintJwtForService(String audienceId, String integrationName) { }
	global static void revokeSelfTrustRelationship(String integrationName) { }
	global static void revokeTrustRelationship(String trustedOrgId, String integrationName) { }

}