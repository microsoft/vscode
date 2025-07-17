global class FieldMetadata {
	global String domain;
	global String field;
	global String fieldApiName;
	global ConnectApi.FieldType fieldType;
	global Boolean filterable;
	global Boolean highlightable;
	global String label;
	global Boolean sortable;
	global FieldMetadata() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}