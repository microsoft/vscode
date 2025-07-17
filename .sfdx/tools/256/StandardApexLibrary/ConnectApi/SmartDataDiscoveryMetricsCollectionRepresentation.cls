global class SmartDataDiscoveryMetricsCollectionRepresentation {
	global ConnectApi.SmartDataDiscoveryLiveMetricsRepresentation liveMetrics;
	global Integer totalActiveModels;
	global Integer totalModels;
	global ConnectApi.SmartDataDiscoveryTrainingMetricsRepresentation trainingMetrics;
	global String url;
	global SmartDataDiscoveryMetricsCollectionRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}