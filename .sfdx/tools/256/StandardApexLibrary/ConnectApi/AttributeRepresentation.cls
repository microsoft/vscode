global class AttributeRepresentation {
	global String apiName;
	global String attributeId;
	global String attributeName;
	global List<ConnectApi.AttributeRepresentation> childAttributes;
	global String dataType;
	global String sortOrder;
	global AttributeRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}