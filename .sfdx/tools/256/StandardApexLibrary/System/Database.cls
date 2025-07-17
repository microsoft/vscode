global class Database {
	/**
	 * Convert a lead, creating or modifying other records
	 */
	global static Database.LeadConvertResult convertLead(Database.LeadConvert leadConvert, Database.DMLOptions DmlOptions, System.AccessLevel accessLevel) { }
	/**
	 * Convert a lead, creating or modifying other records, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.LeadConvertResult convertLead(Database.LeadConvert leadConvert, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Convert leads, creating or modifying other records
	 */
	global static List<Database.LeadConvertResult> convertLead(List<Database.LeadConvert> leadConverts, Database.DMLOptions DmlOptions, System.AccessLevel accessLevel) { }
	/**
	 * Convert leads, creating or modifying other records, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.LeadConvertResult> convertLead(List<Database.LeadConvert> leadConverts, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Convert a lead, creating or modifying other records
	 */
	global static Database.LeadConvertResult convertLead(Database.LeadConvert leadConvert, Database.DMLOptions DmlOptions) { }
	/**
	 * Convert a lead, creating or modifying other records
	 */
	global static Database.LeadConvertResult convertLead(Database.LeadConvert leadConvert, System.AccessLevel accessLevel) { }
	/**
	 * Convert a lead, creating or modifying other records, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.LeadConvertResult convertLead(Database.LeadConvert leadConvert, Boolean allOrNothing) { }
	/**
	 * Convert leads, creating or modifying other records
	 */
	global static List<Database.LeadConvertResult> convertLead(List<Database.LeadConvert> leadConverts, Database.DMLOptions DmlOptions) { }
	/**
	 * Convert leads, creating or modifying other records
	 */
	global static List<Database.LeadConvertResult> convertLead(List<Database.LeadConvert> leadConverts, System.AccessLevel accessLevel) { }
	/**
	 * Convert leads, creating or modifying other records, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.LeadConvertResult> convertLead(List<Database.LeadConvert> leadConverts, Boolean allOrNothing) { }
	/**
	 * Convert a lead, creating or modifying other records
	 */
	global static Database.LeadConvertResult convertLead(Database.LeadConvert leadConvert) { }
	/**
	 * Convert leads, creating or modifying other records
	 */
	global static List<Database.LeadConvertResult> convertLead(List<Database.LeadConvert> leadConverts) { }
	/**
	 * dynamic count query result
	 */
	global static Integer countQuery(String queries, System.AccessLevel accessLevel) { }
	/**
	 * dynamic count query result
	 */
	global static Integer countQuery(String queries) { }
	/**
	 * Dynamic count query result with BindMap
	 */
	global static List<SObject> countQueryWithBinds(String queries, Map<String, Object> bindMap, System.AccessLevel accessLevel) { }
	/**
	 * delete an object, returning the api delete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.DeleteResult delete(Id id, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * delete a set of objects, returning the api delete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.DeleteResult> delete(List<Id> ids, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * delete a set of objects, returning the api delete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.DeleteResult> delete(List<SObject> sobjects, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * delete an object, returning the api delete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.DeleteResult delete(SObject sobject, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * delete an object, returning the api delete results
	 */
	global static Database.DeleteResult delete(Id id, System.AccessLevel accessLevel) { }
	/**
	 * delete an object, returning the api delete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.DeleteResult delete(Id id, Boolean allOrNothing) { }
	/**
	 * delete a set of objects, returning the api delete results including failures
	 */
	global static List<Database.DeleteResult> delete(List<Id> ids, System.AccessLevel accessLevel) { }
	/**
	 * delete a set of objects, returning the api delete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.DeleteResult> delete(List<Id> ids, Boolean allOrNothing) { }
	/**
	 * delete a set of objects, returning the api delete results including failures
	 */
	global static List<Database.DeleteResult> delete(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * delete a set of objects, returning the api delete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.DeleteResult> delete(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * delete an object, returning the api delete results
	 */
	global static Database.DeleteResult delete(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * delete an object, returning the api delete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.DeleteResult delete(SObject sobject, Boolean allOrNothing) { }
	/**
	 * delete an object, returning the api delete results
	 */
	global static Database.DeleteResult delete(Id id) { }
	/**
	 * delete a set of objects, returning the api delete results including failures
	 */
	global static List<Database.DeleteResult> delete(List<Id> ids) { }
	/**
	 * delete a set of objects, returning the api delete results including failures
	 */
	global static List<Database.DeleteResult> delete(List<SObject> sobjects) { }
	/**
	 * delete an object, returning the api delete results
	 */
	global static Database.DeleteResult delete(SObject sobject) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static List<Database.DeleteResult> deleteAsync(List<SObject> sobjects, DataSource.AsyncDeleteCallback callback, System.AccessLevel accessLevel) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static Database.DeleteResult deleteAsync(SObject sobject, DataSource.AsyncDeleteCallback callback, System.AccessLevel accessLevel) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static List<Database.DeleteResult> deleteAsync(List<SObject> sobjects, DataSource.AsyncDeleteCallback callback) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static List<Database.DeleteResult> deleteAsync(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static Database.DeleteResult deleteAsync(SObject sobject, DataSource.AsyncDeleteCallback callback) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static Database.DeleteResult deleteAsync(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static List<Database.DeleteResult> deleteAsync(List<SObject> sobjects) { }
	/**
	 * Initiate an asynchronous delete of an object, returning asyncLocator in the api delete results
	 */
	global static Database.DeleteResult deleteAsync(SObject sobject) { }
	/**
	 * Immediately delete a set of virtual object, returning the api delete results
	 */
	global static List<Database.DeleteResult> deleteImmediate(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Immediately delete a virtual object, returning the api delete results
	 */
	global static Database.DeleteResult deleteImmediate(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Immediately delete a set of virtual object, returning the api delete results
	 */
	global static List<Database.DeleteResult> deleteImmediate(List<SObject> sobjects) { }
	/**
	 * Immediately delete a virtual object, returning the api delete results
	 */
	global static Database.DeleteResult deleteImmediate(SObject sobject) { }
	global static List<Database.EmptyRecycleBinResult> emptyRecycleBin(List<Id> ids) { }
	global static List<Database.EmptyRecycleBinResult> emptyRecycleBin(List<SObject> sobjects) { }
	global static Database.EmptyRecycleBinResult emptyRecycleBin(SObject sobject) { }
	/**
	 * execute a batch job
	 */
	global static String executeBatch(Object batchable, Integer batchSize) { }
	/**
	 * execute a batch job
	 */
	global static String executeBatch(Object batchable) { }
	/**
	 * retrieve status of asynchronous delete identified by the DeleteResult object
	 */
	global static Database.DeleteResult getAsyncDeleteResult(Database.DeleteResult deleteResult) { }
	/**
	 * retrieve status of asynchronous delete identified by async locator
	 */
	global static Database.DeleteResult getAsyncDeleteResult(String asyncLocator) { }
	/**
	 * retrieve async locator from a save or delete result
	 */
	global static String getAsyncLocator(Object result) { }
	/**
	 * retrieve status of asynchronous save identified by the SaveResult object
	 */
	global static Database.SaveResult getAsyncSaveResult(Database.SaveResult saveResult) { }
	/**
	 * retrieve status of asynchronous save identified by async locator
	 */
	global static Database.SaveResult getAsyncSaveResult(String asyncLocator) { }
	/**
	 * create an apex cursor
	 */
	global static Database.Cursor getCursor(String queries, System.AccessLevel accessLevel) { }
	/**
	 * create an apex cursor
	 */
	global static Database.Cursor getCursor(String queries) { }
	/**
	 * create an apex cursor with BindMap
	 */
	global static Database.Cursor getCursorWithBinds(String queries, Map<String, Object> bindMap, System.AccessLevel accessLevel) { }
	/**
	 * Retrieves the list of individual records that have been deleted within the given timespan for the specified SObject type.
	 */
	global static Database.GetDeletedResult getDeleted(String sobjectType, Datetime startDate, Datetime endDate) { }
	/**
	 * create a query locator for batch Apex
	 */
	global static Database.QueryLocator getQueryLocator(List<SObject> queries, System.AccessLevel accessLevel) { }
	/**
	 * create a query locator for batch Apex
	 */
	global static Database.QueryLocator getQueryLocator(String queries, System.AccessLevel accessLevel) { }
	/**
	 * create a query locator for batch Apex
	 */
	global static Database.QueryLocator getQueryLocator(List<SObject> queries) { }
	/**
	 * create a query locator for batch Apex
	 */
	global static Database.QueryLocator getQueryLocator(String queries) { }
	/**
	 * create a query locator for batch Apex with BindMap
	 */
	global static Database.QueryLocator getQueryLocatorWithBinds(String queries, Map<String, Object> bindMap, System.AccessLevel accessLevel) { }
	/**
	 * Retrieves the list of individual records that have been updated within the given timespan for the specified SObject type.
	 */
	global static Database.GetUpdatedResult getUpdated(String sobjectType, Datetime startDate, Datetime endDate) { }
	/**
	 * Insert a set of objects, returning the api save results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.SaveResult> insert(List<SObject> sobjects, Database.DMLOptions DmlOptions, System.AccessLevel accessLevel) { }
	/**
	 * Insert a set of objects, returning the api save results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.SaveResult> insert(List<SObject> sobjects, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Insert an object, returning the api save results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.SaveResult insert(SObject sobject, Database.DMLOptions DmlOptions, System.AccessLevel accessLevel) { }
	/**
	 * Insert an object, returning the api save results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.SaveResult insert(SObject sobject, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Insert a set of objects, returning the api save results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.SaveResult> insert(List<SObject> sobjects, Database.DMLOptions DmlOptions) { }
	/**
	 * Insert a set of objects, returning the api save results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.SaveResult> insert(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * Insert an object, returning the api save results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.SaveResult insert(SObject sobject, Database.DMLOptions DmlOptions) { }
	/**
	 * Insert an object, returning the api save results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.SaveResult insert(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Insert an object, returning the api save results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.SaveResult insert(SObject sobject, Boolean allOrNothing) { }
	/**
	 * Insert a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> insert(List<SObject> sobjects) { }
	/**
	 * Insert an object, returning the api save results
	 */
	global static Database.SaveResult insert(SObject sobject) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> insertAsync(List<SObject> sobjects, DataSource.AsyncSaveCallback callback, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult insertAsync(SObject sobject, DataSource.AsyncSaveCallback callback, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> insertAsync(List<SObject> sobjects, DataSource.AsyncSaveCallback callback) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> insertAsync(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult insertAsync(SObject sobject, DataSource.AsyncSaveCallback callback) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult insertAsync(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> insertAsync(List<SObject> sobjects) { }
	/**
	 * Initiate asynchronous insert of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult insertAsync(SObject sobject) { }
	/**
	 * Immediately insert a set of virtual objects, returning the api save results
	 */
	global static List<Database.SaveResult> insertImmediate(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Immediately insert a virtual object, returning the api save results
	 */
	global static Database.SaveResult insertImmediate(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Immediately insert a set of virtual objects, returning the api save results
	 */
	global static List<Database.SaveResult> insertImmediate(List<SObject> sobjects) { }
	/**
	 * Immediately insert a virtual object, returning the api save results
	 */
	global static Database.SaveResult insertImmediate(SObject sobject) { }
	global static Database.MergeResult merge(SObject primary, Id duplicate, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	global static List<Database.MergeResult> merge(SObject primary, List<Id> duplicates, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	global static List<Database.MergeResult> merge(SObject primary, List<SObject> duplicates, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	global static Database.MergeResult merge(SObject primary, SObject duplicate, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	global static Database.MergeResult merge(SObject primary, Id duplicate, System.AccessLevel accessLevel) { }
	global static Database.MergeResult merge(SObject primary, Id duplicate, Boolean allOrNothing) { }
	global static List<Database.MergeResult> merge(SObject primary, List<Id> duplicates, System.AccessLevel accessLevel) { }
	global static List<Database.MergeResult> merge(SObject primary, List<Id> duplicates, Boolean allOrNothing) { }
	global static List<Database.MergeResult> merge(SObject primary, List<SObject> duplicates, System.AccessLevel accessLevel) { }
	global static List<Database.MergeResult> merge(SObject primary, List<SObject> duplicates, Boolean allOrNothing) { }
	global static Database.MergeResult merge(SObject primary, SObject duplicate, System.AccessLevel accessLevel) { }
	global static Database.MergeResult merge(SObject primary, SObject duplicate, Boolean allOrNothing) { }
	global static Database.MergeResult merge(SObject primary, Id duplicate) { }
	global static List<Database.MergeResult> merge(SObject primary, List<Id> duplicates) { }
	global static List<Database.MergeResult> merge(SObject primary, List<SObject> duplicates) { }
	global static Database.MergeResult merge(SObject primary, SObject duplicate) { }
	/**
	 * dynamic SOQL query result
	 */
	global static List<SObject> query(String queries, System.AccessLevel accessLevel) { }
	/**
	 * dynamic SOQL query result
	 */
	global static List<SObject> query(String queries) { }
	/**
	 * Dynamic SOQL query result with BindMap
	 */
	global static List<SObject> queryWithBinds(String queries, Map<String, Object> bindMap, System.AccessLevel accessLevel) { }
	/**
	 * Release a given savepoint
	 */
	global static void releaseSavepoint(System.Savepoint savepoint) { }
	/**
	 * Restore the database state to a previous savepoint
	 */
	global static void rollback(System.Savepoint savepoint) { }
	/**
	 * Set a database savepoint
	 */
	global static System.Savepoint setSavepoint() { }
	/**
	 * Insert a tree of records.
	 */
	global static List<Database.NestedSaveResult> treeSave(List<SObject> sobjects) { }
	/**
	 * Insert a tree of records.
	 */
	global static Database.NestedSaveResult treeSave(SObject sobject) { }
	/**
	 * undelete an object, returning the api undelete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UndeleteResult undelete(Id id, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * undelete a set of objects, returning the api undelete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UndeleteResult> undelete(List<Id> ids, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * undelete a set of objects, returning the api undelete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UndeleteResult> undelete(List<SObject> sobjects, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * undelete an object, returning the api delete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UndeleteResult undelete(SObject sobject, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * undelete an object, returning the api uddelete results upon success
	 */
	global static Database.UndeleteResult undelete(Id id, System.AccessLevel accessLevel) { }
	/**
	 * undelete an object, returning the api undelete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UndeleteResult undelete(Id id, Boolean allOrNothing) { }
	/**
	 * undelete a set of objects, returning the api undelete results upon success
	 */
	global static List<Database.UndeleteResult> undelete(List<Id> ids, System.AccessLevel accessLevel) { }
	/**
	 * undelete a set of objects, returning the api undelete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UndeleteResult> undelete(List<Id> ids, Boolean allOrNothing) { }
	/**
	 * undelete a set of objects, returning the api undelete results including failures
	 */
	global static List<Database.UndeleteResult> undelete(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * undelete a set of objects, returning the api undelete results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UndeleteResult> undelete(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * undelete an object, returning the api delete results
	 */
	global static Database.UndeleteResult undelete(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * undelete an object, returning the api delete results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UndeleteResult undelete(SObject sobject, Boolean allOrNothing) { }
	/**
	 * undelete an object, returning the api uddelete results upon success
	 */
	global static Database.UndeleteResult undelete(Id id) { }
	/**
	 * undelete a set of objects, returning the api undelete results upon success
	 */
	global static List<Database.UndeleteResult> undelete(List<Id> ids) { }
	/**
	 * undelete a set of objects, returning the api undelete results including failures
	 */
	global static List<Database.UndeleteResult> undelete(List<SObject> sobjects) { }
	/**
	 * undelete an object, returning the api delete results
	 */
	global static Database.UndeleteResult undelete(SObject sobject) { }
	/**
	 * Update a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> update(List<SObject> sobjects, Database.DMLOptions DmlOptions, System.AccessLevel accessLevel) { }
	/**
	 * Update a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> update(List<SObject> sobjects, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Update an object, returning the api save results
	 */
	global static Database.SaveResult update(SObject sobject, Database.DMLOptions DmlOptions, System.AccessLevel accessLevel) { }
	/**
	 * Update an object, returning the api save results
	 */
	global static Database.SaveResult update(SObject sobject, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Update a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> update(List<SObject> sobjects, Database.DMLOptions DmlOptions) { }
	/**
	 * Update a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> update(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Update a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> update(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * Update an object, returning the api save results
	 */
	global static Database.SaveResult update(SObject sobject, Database.DMLOptions DmlOptions) { }
	/**
	 * Update an object, returning the api save results
	 */
	global static Database.SaveResult update(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Update an object, returning the api save results
	 */
	global static Database.SaveResult update(SObject sobject, Boolean allOrNothing) { }
	/**
	 * Update a set of objects, returning the api save results including failures
	 */
	global static List<Database.SaveResult> update(List<SObject> sobjects) { }
	/**
	 * Update an object, returning the api save results
	 */
	global static Database.SaveResult update(SObject sobject) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> updateAsync(List<SObject> sobjects, DataSource.AsyncSaveCallback callback, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult updateAsync(SObject sobject, DataSource.AsyncSaveCallback callback, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> updateAsync(List<SObject> sobjects, DataSource.AsyncSaveCallback callback) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> updateAsync(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult updateAsync(SObject sobject, DataSource.AsyncSaveCallback callback) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult updateAsync(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static List<Database.SaveResult> updateAsync(List<SObject> sobjects) { }
	/**
	 * Initiate asynchronous update of an object, returning asyncLocator in the api save results
	 */
	global static Database.SaveResult updateAsync(SObject sobject) { }
	/**
	 * Immediately update a set of virtual objects, returning the api save results
	 */
	global static List<Database.SaveResult> updateImmediate(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Immediately update a virtual object, returning the api save results
	 */
	global static Database.SaveResult updateImmediate(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Immediately update a set of virtual objects, returning the api save results
	 */
	global static List<Database.SaveResult> updateImmediate(List<SObject> sobjects) { }
	/**
	 * Immediately update a virtual object, returning the api save results
	 */
	global static Database.SaveResult updateImmediate(SObject sobject) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, Schema.SObjectField field, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Upsert an object, returning the api upsert results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UpsertResult upsert(SObject sobject, Schema.SObjectField field, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, Schema.SObjectField field , System.AccessLevel accessLevel) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, Schema.SObjectField field, Boolean allOrNothing) { }
	/**
	 * Upsert an object, returning the api upsert results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UpsertResult upsert(SObject sobject, Boolean allOrNothing, System.AccessLevel accessLevel) { }
	/**
	 * Upsert an object, returning the api upsert results
	 */
	global static Database.UpsertResult upsert(SObject sobject, Schema.SObjectField field, System.AccessLevel accessLevel) { }
	/**
	 * Upsert an object, returning the api upsert results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UpsertResult upsert(SObject sobject, Schema.SObjectField field, Boolean allOrNothing) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, System.AccessLevel accessLevel) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures, optionally choosing to leave any successes in the current transaction
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, Boolean allOrNothing) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects, Schema.SObjectField field) { }
	/**
	 * Upsert an object, returning the api upsert results
	 */
	global static Database.UpsertResult upsert(SObject sobject, System.AccessLevel accessLevel) { }
	/**
	 * Upsert an object, returning the api upsert results, optionally choosing to leave any successes in the current transaction
	 */
	global static Database.UpsertResult upsert(SObject sobject, Boolean allOrNothing) { }
	/**
	 * Upsert an object, returning the api upsert results
	 */
	global static Database.UpsertResult upsert(SObject sobject, Schema.SObjectField field) { }
	/**
	 * Upsert a set of objects, returning the api upsert results including failures
	 */
	global static List<Database.UpsertResult> upsert(List<SObject> sobjects) { }
	/**
	 * Upsert an object, returning the api upsert results
	 */
	global static Database.UpsertResult upsert(SObject sobject) { }

}