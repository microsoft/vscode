global class ContactPointConfig {
	global ConnectApi.ActivationContactPointsFieldConfig activationContactPointFieldConfig;
	global ConnectApi.ActivationContactPointsSourceConfig activationContactPointSourcesConfig;
	global ConnectApi.ContactPointFilterExpression contactPointFilterExpression;
	global String contactPointPath;
	global ConnectApi.ContactPointType contactPointType;
	global String entityId;
	global String entityName;
	global ConnectApi.QueryPathConfigList queryPathConfigList;
	global ContactPointConfig() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}