global class CdpQueryDataGraphMetadata {
	global String dataspaceName;
	global String description;
	global String developerName;
	global ConnectApi.DataGraphObjectData dgObject;
	global Object extendedProperties;
	global String idDmoName;
	global ConnectApi.DataGraphIdsDmo idsDmo;
	global String primaryObjectName;
	global ConnectApi.DataGraphObjectTypeEnum primaryObjectType;
	global ConnectApi.DataGraphStatusEnum status;
	global ConnectApi.DataGraphValuesDmo valuesDmo;
	global String valuesDmoName;
	global String version;
	global CdpQueryDataGraphMetadata() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}