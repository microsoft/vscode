global class SmartDataDiscoveryPredictSettings {
	global List<String> aggregateFunctions;
	global Integer maxMiddleValues;
	global Integer maxPrescriptions;
	global Integer prescriptionImpactPercentage;
	global ConnectApi.SmartDataDiscoveryProjectedPredictionSettings projectedPredictions;
	global SmartDataDiscoveryPredictSettings() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}