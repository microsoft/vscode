global class Approval {
	/**
	 * Returns true if record is locked, false otherwise.
	 */
	global static Boolean isLocked(Id id) { }
	/**
	 * Returns a map of record id to lock status; true if locked, false otherwise.
	 */
	global static Map<Id,Boolean> isLocked(List<Id> ids) { }
	/**
	 * Returns a map of record id to lock status; true if locked, false otherwise.
	 */
	global static Map<Id,Boolean> isLocked(List<SObject> sobjects) { }
	/**
	 * Returns true if record is locked, false otherwise.
	 */
	global static Boolean isLocked(SObject sobject) { }
	/**
	 * Lock an object, returning the api lock results, optionally choosing to leave any successes in the current transaction
	 */
	global static Approval.LockResult lock(Id id, Boolean allOrNothing) { }
	/**
	 * Lock a set of objects, returning the api lock results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Approval.LockResult> lock(List<Id> ids, Boolean allOrNothing) { }
	/**
	 * Lock a list of objects, returning the api lock results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Approval.LockResult> lock(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * Lock an object, returning the api lock results, optionally choosing to leave any successes in the current transaction
	 */
	global static Approval.LockResult lock(SObject sobject, Boolean allOrNothing) { }
	/**
	 * Lock an object, returning the api lock results
	 */
	global static Approval.LockResult lock(Id id) { }
	/**
	 * Lock a set of objects, returning the api lock results including failures
	 */
	global static List<Approval.LockResult> lock(List<Id> ids) { }
	/**
	 * Lock a list of objects, returning the api lock results including failures
	 */
	global static List<Approval.LockResult> lock(List<SObject> sobjects) { }
	/**
	 * Lock an object, returning the api lock results
	 */
	global static Approval.LockResult lock(SObject sobject) { }
	/**
	 * Unlock an object, returning the api unlock results, optionally choosing to leave any successes in the current transaction
	 */
	global static Approval.UnlockResult unlock(Id id, Boolean allOrNothing) { }
	/**
	 * Unlock a set of objects, returning the api unlock results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Approval.UnlockResult> unlock(List<Id> ids, Boolean allOrNothing) { }
	/**
	 * Unlock a set of objects, returning the api unlock results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Approval.UnlockResult> unlock(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * Unlock an object, returning the api unlock results, optionally choosing to leave any successes in the current transaction
	 */
	global static Approval.UnlockResult unlock(SObject sobject, Boolean allOrNothing) { }
	/**
	 * Unlock an object, returning the api unlock results
	 */
	global static Approval.UnlockResult unlock(Id id) { }
	/**
	 * Unlock a set of objects, returning the api unlock results including failures
	 */
	global static List<Approval.UnlockResult> unlock(List<Id> ids) { }
	/**
	 * Unlock a set of objects, returning the api unlock results including failures
	 */
	global static List<Approval.UnlockResult> unlock(List<SObject> sobjects) { }
	/**
	 * Unlock an object, returning the api unlock results
	 */
	global static Approval.UnlockResult unlock(SObject sobject) { }

}