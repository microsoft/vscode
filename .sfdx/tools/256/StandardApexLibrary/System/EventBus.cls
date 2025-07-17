global class EventBus {
	/**
	 * retrieve Operation Id from a save result
	 */
	global static String getOperationId(Object result) { }
	/**
	 * Publish a set of Platform Events, returning the api save results
	 */
	global static List<Database.SaveResult> publish(List<SObject> sobjects, Object callback) { }
	/**
	 * Publish a Platform Event with the given callback, returning the api save results
	 */
	global static Database.SaveResult publish(SObject sobject, Object callback) { }
	/**
	 * Publish a set of Platform Events, returning the api save results
	 */
	global static List<Database.SaveResult> publish(List<SObject> sobjects) { }
	/**
	 * Publish a Platform Event, returning the api save results
	 */
	global static Database.SaveResult publish(SObject sobject) { }

}