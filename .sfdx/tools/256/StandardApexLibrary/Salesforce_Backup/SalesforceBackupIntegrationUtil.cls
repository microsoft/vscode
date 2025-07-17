global class SalesforceBackupIntegrationUtil {
	global SalesforceBackupIntegrationUtil() { }
	global Object clone() { }
	global static String executeRequest(String sbPackagePrefix, String method, String path, Map<String,String> headers, Map<String,String> params, String body) { }
	global static Boolean hasUserAccessToSBModule(String sbPackagePrefix) { }

}