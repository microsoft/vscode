global class AttributeFilterInput {
	global String attributeId;
	global String attributeName;
	global List<String> attributeValues;
	global ConnectApi.FilterDateUnit dateUnits;
	global String operator;
	global ConnectApi.FilterOperatorDataType type;
	global AttributeFilterInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}