global class FeatureManagement {
	global FeatureManagement() { }
	global static void changeProtection(String apiName, String typeApiName, String protection) { }
	global static Boolean checkPackageBooleanValue(String apiName) { }
	global static Date checkPackageDateValue(String apiName) { }
	global static Integer checkPackageIntegerValue(String apiName) { }
	global static Boolean checkPermission(String apiName) { }
	global Object clone() { }
	global static void setPackageBooleanValue(String apiName, Boolean value) { }
	global static void setPackageDateValue(String apiName, Date value) { }
	global static void setPackageIntegerValue(String apiName, Integer value) { }

}