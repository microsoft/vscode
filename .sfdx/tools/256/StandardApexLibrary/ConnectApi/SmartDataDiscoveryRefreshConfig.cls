global class SmartDataDiscoveryRefreshConfig {
	global Boolean isEnabled;
	global List<ConnectApi.SmartDataDiscoveryRecipient> recipientList;
	global Boolean shouldScoreAfterRefresh;
	global ConnectApi.SmartDataDiscoveryUser userContext;
	global Double warningThresholdPercentage;
	global SmartDataDiscoveryRefreshConfig() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}