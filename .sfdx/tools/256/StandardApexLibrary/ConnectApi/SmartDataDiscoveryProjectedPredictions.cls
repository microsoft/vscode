global class SmartDataDiscoveryProjectedPredictions {
	global List<ConnectApi.SmartDataDiscoveryProjectedPredictionField> fields;
	global ConnectApi.AbstractSmartDataDiscoveryProjectedPredictionsIntervalSetting intervalSetting;
	global ConnectApi.SmartDataDiscoveryProjectedPredictionsIntervalTypeEnum intervalType;
	global Integer numberOfIntervalsProjectedAhead;
	global List<ConnectApi.AbstractSmartDataDiscoveryProjectedPrediction> predictions;
	global SmartDataDiscoveryProjectedPredictions() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}