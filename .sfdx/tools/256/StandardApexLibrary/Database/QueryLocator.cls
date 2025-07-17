global class QueryLocator {
	global Boolean equals(Object obj) { }
	/**
	 * Gets the underlying query for this QueryLocator
	 */
	global String getQuery() { }
	global Integer hashCode() { }
	/**
	 * Gets an iterator over the results of this QueryLocator
	 */
	global Database.QueryLocatorIterator iterator() { }
	global List<SObject> querymore(Integer num) { }
	global String toString() { }

}