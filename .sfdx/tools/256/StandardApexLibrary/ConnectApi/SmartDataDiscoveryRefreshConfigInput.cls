global class SmartDataDiscoveryRefreshConfigInput {
	global Boolean isEnabled;
	global List<ConnectApi.SmartDataDiscoveryRecipientInput> recipientList;
	global Boolean shouldScoreAfterRefresh;
	global ConnectApi.SmartDataDiscoveryAssetReferenceInput userContext;
	global Double warningThresholdPercentage;
	global SmartDataDiscoveryRefreshConfigInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}