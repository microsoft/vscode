global class SmartDataDiscoveryPrediction {
	global List<ConnectApi.AbstractSmartDataDiscoveryAggregatePredictionRepresentation> aggregatePredictions;
	global String entityId;
	global Map<String,String> exploratoryValues;
	global ConnectApi.SmartDataDiscoveryAbstractPredict prediction;
	global String predictionDefinition;
	global String predictionDefinitionId;
	global ConnectApi.SmartDataDiscoveryPredictionTypeEnum predictionType;
	global List<ConnectApi.AbstractSmartDataDiscoveryPredictRepresentation> predictions;
	global List<ConnectApi.SmartDataDiscoveryPredictCondition> prescriptions;
	global ConnectApi.SmartDataDiscoveryPredictSettings settings;
	global SmartDataDiscoveryPrediction() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}