global class SmartDataDiscoveryModel {
	global List<String> actionableFields;
	global List<ConnectApi.AbstractSmartDataDiscoveryModelField> actionableVariables;
	global ConnectApi.SmartDataDiscoveryAssetReference analysis;
	global ConnectApi.SmartDataDiscoveryAbstractClassificationThreshold classificationThreshold;
	global ConnectApi.SmartDataDiscoveryUser createdBy;
	global Datetime createdDate;
	global List<ConnectApi.SmartDataDiscoveryCustomizableField> customizableFactors;
	global Map<String,String> fieldMap;
	global List<ConnectApi.SmartDataDiscoveryFieldMapping> fieldMappingList;
	global List<ConnectApi.SmartDataDiscoveryFilter> filters;
	global String historyUrl;
	global String id;
	global Boolean isActive;
	global Boolean isRefreshEnabled;
	global String label;
	global ConnectApi.SmartDataDiscoveryUser lastModifiedBy;
	global Datetime lastModifiedDate;
	global Double liveMetricThreshold;
	global ConnectApi.SmartDataDiscoveryAssetReference model;
	global String modelType;
	global String name;
	global String predictionDefinitionUrl;
	global List<ConnectApi.SmartDataDiscoveryPrescribableField> prescribableFields;
	global Integer sortOrder;
	global Object state;
	global String stateVersion;
	global ConnectApi.SmartDataDiscoveryPredDefModelStatus status;
	global ConnectApi.SmartDataDiscoveryAssetReference story;
	global List<ConnectApi.AbstractSmartDataDiscoveryTransformationOverride> transformationOverrides;
	global String url;
	global SmartDataDiscoveryModel() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}