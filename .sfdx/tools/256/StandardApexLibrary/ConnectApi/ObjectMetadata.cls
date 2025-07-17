global class ObjectMetadata {
	global Map<String,ConnectApi.DataCategoryMetadata> dataCategories;
	global Map<String,ConnectApi.FieldMetadata> fields;
	global String label;
	global String labelPlural;
	global String objectApiName;
	global ConnectApi.ThemeInfo themeInfo;
	global ObjectMetadata() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}