global class DataGraphObjectData {
	global String dataGraphSourceDevName;
	global String developerName;
	global List<ConnectApi.DataGraphField> fields;
	global String filterCriteria;
	global String memberDmoName;
	global List<ConnectApi.DataGraphRelationship> paths;
	global List<ConnectApi.RecencyCriteria> recencyCriteria;
	global List<ConnectApi.DataGraphObjectData> relatedObjects;
	global ConnectApi.DataGraphObjectTypeEnum type;
	global DataGraphObjectData() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}