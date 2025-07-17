global class CdpMlPredictResult {
	global List<ConnectApi.CdpMlAggregatePrediction> aggregatePredictions;
	global ConnectApi.CdpAssetReference model;
	global ConnectApi.CdpMlModelPredictionTypeEnum predictionType;
	global List<ConnectApi.CdpMlPredictionBase> predictions;
	global ConnectApi.CdpMlPredictSettings settings;
	global CdpMlPredictResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}