global class CPQProductComponentGroupOutputRepresentation {
	global List<ConnectApi.CPQProductComponentGroupOutputRepresentation> childGroups;
	global List<ConnectApi.CPQProductClassificationOutputRepresentation> classifications;
	global String code;
	global List<ConnectApi.CPQProductDetailsOutputRepresentation> components;
	global String description;
	global String id;
	global Boolean isExcluded;
	global Integer maxBundleComponents;
	global Integer minBundleComponents;
	global String name;
	global String parentGroupId;
	global String parentProductId;
	global Integer sequence;
	global CPQProductComponentGroupOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}