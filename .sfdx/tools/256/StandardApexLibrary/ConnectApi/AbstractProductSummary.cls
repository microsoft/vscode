global class AbstractProductSummary {
	global ConnectApi.ProductMedia defaultImage;
	global Map<String,ConnectApi.FieldValue> fields;
	global String id;
	global String name;
	global ConnectApi.ProductClass productClass;
	global String urlName;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global ConnectApi.ProductMedia getDefaultImage() { }
	global Map<String,ConnectApi.FieldValue> getFields() { }
	global String getId() { }
	global String getName() { }
	global ConnectApi.ProductClass getProductClass() { }
	global String getUrlName() { }
	global Integer hashCode() { }
	global void setDefaultImage(ConnectApi.ProductMedia value) { }
	global void setFields(Map<String,ConnectApi.FieldValue> value) { }
	global void setId(String value) { }
	global void setName(String value) { }
	global void setProductClass(ConnectApi.ProductClass value) { }
	global void setUrlName(String value) { }
	global String toString() { }

}