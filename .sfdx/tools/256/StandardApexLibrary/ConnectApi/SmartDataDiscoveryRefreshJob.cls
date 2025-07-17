global class SmartDataDiscoveryRefreshJob {
	global ConnectApi.SmartDataDiscoveryUser createdBy;
	global Datetime createdDate;
	global Datetime endTime;
	global String id;
	global String message;
	global ConnectApi.SmartDataDiscoveryAssetReference refreshTarget;
	global String refreshTasksUrl;
	global Datetime startTime;
	global ConnectApi.SmartDataDiscoveryRefreshJobStatusEnum status;
	global ConnectApi.SmartDataDiscoveryRefreshJobTypeEnum type;
	global String url;
	global SmartDataDiscoveryRefreshJob() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}