global class ActivationAttribute {
	global String activationPlatformAttrId;
	global String attributeLabel;
	global String attributeName;
	global String curatedFieldId;
	global String dataSourceType;
	global String entityName;
	global ConnectApi.AttributeFilterExpression filterExpression;
	global ConnectApi.QueryPathConfigList path;
	global String preferredName;
	global String refAttrDeveloperName;
	global ConnectApi.DataExportAttributeSource source;
	global ConnectApi.DataExportAttributeType type;
	global ActivationAttribute() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}