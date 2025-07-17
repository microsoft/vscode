global class AttributeFilter {
	global String attributeId;
	global String attributeName;
	global ConnectApi.FilterDateUnit dateUnits;
	global String operator;
	global ConnectApi.FilterOperatorDataType type;
	global List<String> values;
	global AttributeFilter() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}