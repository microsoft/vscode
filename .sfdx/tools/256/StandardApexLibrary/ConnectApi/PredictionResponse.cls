global class PredictionResponse {
	global String batchDatasource;
	global Double classificationThreshold;
	global String classificationType;
	global String executionModeWarning;
	global String featureExtractor;
	global String featureExtractorIdentifier;
	global String featureExtractorType;
	global String featureInputType;
	global String inputType;
	global Map<String,Integer> insightsSettings;
	global List<ConnectApi.ModelFeature> modelFeatures;
	global String outcomeGoal;
	global String predictionDefinition;
	global String predictionDefinitionLabel;
	global String predictionPersistenceErrorMessage;
	global String predictionPlatform;
	global String predictionPurpose;
	global List<ConnectApi.PredictionObject> predictions;
	global List<String> primaryResponseObjRecordIds;
	global String requestId;
	global List<String> secondaryResponseObjRecordIds;
	global ConnectApi.Status status;
	global PredictionResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}