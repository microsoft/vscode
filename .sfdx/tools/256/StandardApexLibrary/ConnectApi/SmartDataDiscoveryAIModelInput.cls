global class SmartDataDiscoveryAIModelInput {
	global String description;
	global ConnectApi.SmartDataDiscoveryAbstractAIModelSourceInput input;
	global String label;
	global Object modelData;
	global List<ConnectApi.SmartDataDiscoveryAbstractModelFieldInput> modelFields;
	global ConnectApi.AbstractSmartDataDiscoveryModelRuntimeInput modelRuntime;
	global String name;
	global String predictedField;
	global ConnectApi.SmartDataDiscoveryAbstractPredictionPropertyInput predictionProperty;
	global ConnectApi.SmartDataDiscoveryAIModelStatus status;
	global List<ConnectApi.SmartDataDiscoveryAIModelTransformationInput> transformations;
	global Object validationResult;
	global SmartDataDiscoveryAIModelInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}