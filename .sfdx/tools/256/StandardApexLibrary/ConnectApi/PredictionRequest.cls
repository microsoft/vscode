global class PredictionRequest {
	global Boolean async;
	global List<String> columnNames;
	global Boolean enableFeaturePersistence;
	global Boolean enableInsightPersistence;
	global Boolean enableScorePersistence;
	global Boolean enableSuggestionPersistence;
	global Boolean enrichModelClassification;
	global Boolean enrichModelFeatures;
	global Boolean enrichPredictionDefinition;
	global Map<String,String> featureColumnMap;
	global List<ConnectApi.FeatureExtractionParametersFieldMapValue> featureExtractionParameters;
	global String featureExtractorDevName;
	global String featureExtractorId;
	global String historyReferencePoint;
	global String inputType;
	global Map<String,String> insightColumnMap;
	global Map<String,Integer> insightsSettings;
	global String predictionDefinition;
	global List<ConnectApi.RawDataInputWrap> rawData;
	global List<String> records;
	global String scorePersistenceColumn;
	global String secondaryRecordIdPersistenceField;
	global Map<String,String> suggestionColumnMap;
	global String usecaseDefinition;
	global String usecaseDevName;
	global PredictionRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}