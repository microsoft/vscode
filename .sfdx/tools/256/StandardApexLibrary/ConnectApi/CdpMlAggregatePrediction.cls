global class CdpMlAggregatePrediction {
	global List<ConnectApi.CdpMlAggregatePredictCondition> factors;
	global List<ConnectApi.CdpMlAggregatePredictCondition> prescriptions;
	global ConnectApi.CdpMlPredictAggregateFunctionStatusEnum status;
	global ConnectApi.CdpMlPredictAggregateFunctionTypeEnum type;
	global Double value;
	global CdpMlAggregatePrediction() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}