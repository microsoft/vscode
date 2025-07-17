global class MenuActionServices {
	global MenuActionServices() { }
	global Object clone() { }
	global static String getParamsForPost(String url, String paramsJsonString) { }
	global static String multiPartPost(String versionID, String url, String paramsJsonString, String filePartParamName, String fileExt) { }

}