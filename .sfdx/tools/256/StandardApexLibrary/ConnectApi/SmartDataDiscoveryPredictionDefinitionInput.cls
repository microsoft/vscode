global class SmartDataDiscoveryPredictionDefinitionInput {
	global Boolean isActive;
	global Boolean isWritingToEntity;
	global String label;
	global String mappedOutcomeField;
	global String name;
	global ConnectApi.SmartDataDiscoveryPredDefOutcomeInput outcome;
	global String outcomeField;
	global String outcomeFieldLabel;
	global ConnectApi.SmartDataDiscoveryOutcomeGoal outcomeGoal;
	global ConnectApi.SmartDataDiscoveryPredictionTypeEnum predictionType;
	global ConnectApi.SmartDataDiscoveryPredDefPushbackFieldInput pushbackField;
	global ConnectApi.SmartDataDiscoveryPushbackType pushbackType;
	global ConnectApi.SmartDataDiscoveryRefreshConfigInput refreshConfig;
	global ConnectApi.SmartDataDiscoveryPredDefModelStatus status;
	global String subscribedEntity;
	global ConnectApi.SmartDataDiscoveryComplexFilterInput terminalStateFilter;
	global SmartDataDiscoveryPredictionDefinitionInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}