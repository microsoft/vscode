global class MediaConfigurationMetadataInputRepresentation {
	global List<String> configurationKeys;
	global String configurationType;
	global String correlationId;
	global String dealType;
	global String decisionTableId;
	global ConnectApi.ExecutionModeEnum executionMode;
	global List<ConnectApi.ConfigurationMetadataProductInputRepresentation> productList;
	global String quoteActionType;
	global String quoteStatus;
	global MediaConfigurationMetadataInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}