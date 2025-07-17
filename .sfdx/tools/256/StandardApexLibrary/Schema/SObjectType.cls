global class SObjectType {
	global Boolean equals(Object obj) { }
	/**
	 * Return the describe information for this SObject type
	 */
	global Schema.DescribeSObjectResult getDescribe(Object options) { }
	/**
	 * Return the describe information for this SObject type
	 */
	global Schema.DescribeSObjectResult getDescribe() { }
	global Integer hashCode() { }
	/**
	 * Factory method to construct a new SObject of this type, optionally with a record type Id and/or default field values loaded
	 */
	global SObject newSObject(Id recordTypeId, Boolean loadDefaultValues) { }
	/**
	 * Factory method to construct a new SObject of this type, with a valid Id
	 */
	global SObject newSObject(Id id) { }
	/**
	 * Factory method to construct a new SObject of this type
	 */
	global SObject newSObject() { }
	global String toString() { }

}