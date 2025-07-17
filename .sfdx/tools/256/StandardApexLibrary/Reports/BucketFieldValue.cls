global class BucketFieldValue {
	global BucketFieldValue(String label, List<String> sourceDimensionValues, Double rangeUpperBound) { }
	global BucketFieldValue() { }
	global Object clone() { }
	global String getLabel() { }
	global Double getRangeUpperBound() { }
	global List<String> getSourceDimensionValues() { }
	global void setLabel(String label) { }
	global void setRangeUpperBound(Double rangeUpperBound) { }
	global void setSourceDimensionValues(List<String> sourceDimensionValues) { }
	global String toString() { }

}