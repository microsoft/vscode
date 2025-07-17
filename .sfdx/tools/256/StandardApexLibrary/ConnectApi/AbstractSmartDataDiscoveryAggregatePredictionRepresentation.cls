global class AbstractSmartDataDiscoveryAggregatePredictionRepresentation {
	global ConnectApi.SmartDataDiscoveryPredictAggregateFunctionEnum aggregateFunction;
	global List<ConnectApi.SmartDataDiscoveryAggregatePredictConditionRepresentation> middleValues;
	global List<ConnectApi.SmartDataDiscoveryAggregatePredictConditionRepresentation> prescriptions;
	global ConnectApi.SmartDataDiscoveryAggregatePredictStatusEnum status;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}