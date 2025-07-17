global class SmartDataDiscoveryRefreshTask {
	global ConnectApi.SmartDataDiscoveryUser createdBy;
	global Datetime createdDate;
	global Datetime endTime;
	global String id;
	global String message;
	global ConnectApi.SmartDataDiscoveryAssetReference refreshTarget;
	global ConnectApi.SmartDataDiscoveryAssetReference refreshedAIModel;
	global ConnectApi.SmartDataDiscoveryRefreshTaskSource source;
	global Datetime startTime;
	global ConnectApi.SmartDataDiscoveryRefreshTaskStatusEnum status;
	global String url;
	global SmartDataDiscoveryRefreshTask() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}