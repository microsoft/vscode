global class KnowledgeArticleVersionStandardController {
	global KnowledgeArticleVersionStandardController(SObject sobject) { }
	/**
	 * Add a reference to each field whose name is specified in list of strings so it is retrieved when the record is loaded by the controller.
	 */
	global void addFields(List<String> fieldNames) { }
	/**
	 * Cancel changes; returning returl
	 */
	global System.PageReference cancel() { }
	global Boolean equals(Object obj) { }
	/**
	 * Get the ID for the subject record
	 */
	global String getId() { }
	/**
	 * Get the subject record
	 */
	global SObject getRecord() { }
	/**
	 * Get the ID for the source object record when creating a new article from another object
	 */
	global String getSourceId() { }
	global Integer hashCode() { }
	/**
	 * Select a default data category for the specified data category group when creating a new article
	 */
	global void selectDataCategory(String categoryGroup, String category) { }
	global String toString() { }
	/**
	 * Get View URL for a record
	 */
	global System.PageReference view() { }

}