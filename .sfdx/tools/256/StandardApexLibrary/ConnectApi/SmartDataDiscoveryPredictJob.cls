global class SmartDataDiscoveryPredictJob {
	global Integer batchSize;
	global ConnectApi.SmartDataDiscoveryUser createdBy;
	global Datetime createdDate;
	global Integer failedRecords;
	global List<ConnectApi.SmartDataDiscoveryFilter> filters;
	global String id;
	global String label;
	global ConnectApi.SmartDataDiscoveryUser lastModifiedBy;
	global Datetime lastModifiedDate;
	global String message;
	global String name;
	global ConnectApi.SmartDataDiscoveryAssetReference predictionDefinition;
	global Integer processedRecords;
	global ConnectApi.SmartDataDiscoveryPredictJobStatusEnum status;
	global String subscribedEntity;
	global Integer totalRecords;
	global String url;
	global Boolean useTerminalStateFilter;
	global SmartDataDiscoveryPredictJob() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}