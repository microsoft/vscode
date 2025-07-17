global class BucketField {
	global BucketField(reports.BucketType bucketType, String devloperName, String label, Boolean nullTreatedAsZero, String otherBucketLabel, String sourceColumnName, List<reports.BucketFieldValue> values) { }
	global BucketField() { }
	global Object clone() { }
	global reports.BucketType getBucketType() { }
	global String getDevloperName() { }
	global String getLabel() { }
	global Boolean getNullTreatedAsZero() { }
	global String getOtherBucketLabel() { }
	global String getSourceColumnName() { }
	global List<reports.BucketFieldValue> getValues() { }
	global void setBucketType(String value) { }
	global void setBucketType(reports.BucketType bucketType) { }
	global void setDevloperName(String devloperName) { }
	global void setLabel(String label) { }
	global void setNullTreatedAsZero(Boolean nullTreatedAsZero) { }
	global void setOtherBucketLabel(String otherBucketLabel) { }
	global void setSourceColumnName(String sourceColumnName) { }
	global void setValues(List<reports.BucketFieldValue> values) { }
	global String toString() { }

}