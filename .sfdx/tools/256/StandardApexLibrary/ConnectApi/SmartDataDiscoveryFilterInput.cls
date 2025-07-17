global class SmartDataDiscoveryFilterInput {
	global String fieldName;
	global List<ConnectApi.SmartDataDiscoveryFilterValueInput> filterValues;
	global ConnectApi.SmartDataDiscoveryFilterOperator operator;
	global ConnectApi.SmartDataDiscoveryFilterFieldTypeEnum type;
	global List<String> values;
	global SmartDataDiscoveryFilterInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}