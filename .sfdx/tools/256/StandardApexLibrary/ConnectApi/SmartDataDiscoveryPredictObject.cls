global class SmartDataDiscoveryPredictObject {
	global ConnectApi.SmartDataDiscoveryAssetReference model;
	global ConnectApi.SmartDataDiscoveryAbstractPredict prediction;
	global List<ConnectApi.SmartDataDiscoveryPredictCondition> prescriptions;
	global ConnectApi.SmartDataDiscoveryProjectedPredictions projectedPredictions;
	global SmartDataDiscoveryPredictObject() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}