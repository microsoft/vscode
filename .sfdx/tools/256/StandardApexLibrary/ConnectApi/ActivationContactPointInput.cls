global class ActivationContactPointInput {
	global List<ConnectApi.ContactPointAttributeInput> attributesConfig;
	global List<ConnectApi.DMOFilterInput> contactPointFilterExpression;
	global ConnectApi.ContactPointType contactPointType;
	global String entityName;
	global String externalPlatformHashMethod;
	global List<ConnectApi.QueryPathInputConfig> queryPathConfigList;
	global List<ConnectApi.ContactPointSourceInput> sourcesConfig;
	global ActivationContactPointInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}