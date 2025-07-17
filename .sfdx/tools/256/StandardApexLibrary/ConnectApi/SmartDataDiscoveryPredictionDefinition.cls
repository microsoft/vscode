global class SmartDataDiscoveryPredictionDefinition {
	global Integer countOfActiveModels;
	global Integer countOfModels;
	global ConnectApi.SmartDataDiscoveryUser createdBy;
	global Datetime createdDate;
	global String id;
	global Boolean isActive;
	global Boolean isWritingToEntity;
	global String label;
	global ConnectApi.SmartDataDiscoveryUser lastModifiedBy;
	global Datetime lastModifiedDate;
	global String mappedOutcomeField;
	global String modelsUrl;
	global String name;
	global String namespace;
	global Integer ninetyDayWarningsCount;
	global ConnectApi.SmartDataDiscoveryPredDefOutcome outcome;
	global String outcomeField;
	global String outcomeFieldLabel;
	global ConnectApi.SmartDataDiscoveryOutcomeGoal outcomeGoal;
	global ConnectApi.SmartDataDiscoveryPredictionTypeEnum predictionType;
	global ConnectApi.SmartDataDiscoveryPushbackField pushbackField;
	global ConnectApi.SmartDataDiscoveryPushbackType pushbackType;
	global ConnectApi.SmartDataDiscoveryRefreshConfig refreshConfig;
	global ConnectApi.SmartDataDiscoveryPredDefModelStatus status;
	global String subscribedEntity;
	global ConnectApi.SmartDataDiscoveryFilterList terminalStateFilter;
	global Integer totalPredictionsCount;
	global Integer totalWarningsCount;
	global String url;
	global SmartDataDiscoveryPredictionDefinition() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}