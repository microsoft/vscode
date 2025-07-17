global class Network {
	global Network() { }
	global Object clone() { }
	global static System.PageReference communitiesLanding() { }
	global static String createExternalUserAsync(SObject user, SObject contact, SObject account) { }
	global static String createRecordAsync(String processType, SObject mbObject) { }
	global static System.PageReference forwardToAuthPage(String startUrl, String displayType) { }
	global static System.PageReference forwardToAuthPage(String startUrl) { }
	global static String getLoginUrl(String networkId) { }
	global static String getLogoutUrl(String networkId) { }
	global static String getNetworkId() { }
	global static String getSelfRegUrl(String networkId) { }
	global static Integer loadAllPackageDefaultNetworkDashboardSettings() { }
	global static Integer loadAllPackageDefaultNetworkPulseSettings() { }
	global static Integer loadAllPackageDefaultNetworkWorkspaceMetricSettings() { }

}