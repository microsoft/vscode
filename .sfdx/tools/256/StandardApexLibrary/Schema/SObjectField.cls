global class SObjectField {
	global Boolean equals(Object obj) { }
	/**
	 * Return the describe information for this field
	 */
	global Schema.DescribeFieldResult getDescribe(Object options) { }
	/**
	 * Return the describe information for this field
	 */
	global Schema.DescribeFieldResult getDescribe() { }
	global Integer hashCode() { }
	global String toString() { }

}