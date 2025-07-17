global class ActivationAdditionalAttributesConfigInput {
	global String activationPlatformAttrId;
	global String attributeLabel;
	global String attributeName;
	global String curatedFieldId;
	global String dataSourceType;
	global String entityName;
	global List<ConnectApi.AttributeFilterInput> filterExpression;
	global Boolean isRolluppable;
	global List<ConnectApi.QueryPathInputConfig> path;
	global String preferredName;
	global String refAttrDeveloperName;
	global ConnectApi.DataExportAttributeSource source;
	global ConnectApi.DataExportAttributeType type;
	global ActivationAdditionalAttributesConfigInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}