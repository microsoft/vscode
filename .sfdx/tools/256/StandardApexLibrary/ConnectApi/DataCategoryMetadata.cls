global class DataCategoryMetadata {
	global String groupName;
	global String label;
	global Map<String,ConnectApi.DataCategoryValueMetadata> values;
	global DataCategoryMetadata() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}