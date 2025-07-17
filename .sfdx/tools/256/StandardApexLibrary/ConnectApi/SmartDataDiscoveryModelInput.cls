global class SmartDataDiscoveryModelInput {
	global List<String> actionableFields;
	global ConnectApi.SmartDataDiscoveryAssetReferenceInput analysis;
	global ConnectApi.SmartDataDiscoveryAbstractClassificationThresholdInput classificationThreshold;
	global List<ConnectApi.SmartDataDiscoveryCustomizableFieldInput> customizableFactors;
	global Map<String,String> fieldMap;
	global List<ConnectApi.SmartDataDiscoveryFieldMappingInput> fieldMapping;
	global ConnectApi.SmartDataDiscoveryComplexFilterInput filterList;
	global Boolean isActive;
	global Boolean isRefreshEnabled;
	global String label;
	global Double liveMetricThreshold;
	global ConnectApi.SmartDataDiscoveryAssetReferenceInput model;
	global String name;
	global List<ConnectApi.SmartDataDiscoveryPrescribableFieldInput> prescribableFields;
	global Integer sortOrder;
	global Object state;
	global ConnectApi.SmartDataDiscoveryPredDefModelStatus status;
	global List<ConnectApi.AbstractSmartDataDiscoveryTransformationOverrideInput> transformationOverrides;
	global SmartDataDiscoveryModelInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}