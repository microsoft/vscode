global class StandardSetController {
	global StandardSetController(Database.QueryLocator queryLocator) { }
	global StandardSetController(List<SObject> records) { }
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
	 * First
	 */
	global void first() { }
	/**
	 * Indicate whether there are more records than the max record limit
	 */
	global Boolean getCompleteResult() { }
	/**
	 * Return the filter ID
	 */
	global String getFilterId() { }
	/**
	 * Indicate whether there are any more records
	 */
	global Boolean getHasNext() { }
	/**
	 * Indicate whether there are previous records
	 */
	global Boolean getHasPrevious() { }
	/**
	 * Return The set of listviews available to the current user
	 */
	global List<System.SelectOption> getListViewOptions() { }
	/**
	 * Return the pagenumber
	 */
	global Integer getPageNumber() { }
	/**
	 * Return the page size
	 */
	global Integer getPageSize() { }
	/**
	 * Get the subject record
	 */
	global SObject getRecord() { }
	/**
	 * Get the records
	 */
	global List<SObject> getRecords() { }
	/**
	 * Return the result size
	 */
	global Integer getResultSize() { }
	/**
	 * Get the selected records
	 */
	global List<SObject> getSelected() { }
	global Integer hashCode() { }
	/**
	 * Last
	 */
	global void last() { }
	/**
	 * Next
	 */
	global void next() { }
	/**
	 * Previous
	 */
	global void previous() { }
	/**
	 * Save any modified or new records
	 */
	global System.PageReference save() { }
	/**
	 * Set the filter ID
	 */
	global void setFilterId(String filterId) { }
	/**
	 * Set the page number
	 */
	global void setPageNumber(Integer pageNumber) { }
	/**
	 * Set the page size
	 */
	global void setPageSize(Integer pageSize) { }
	/**
	 * Set the selected records
	 */
	global void setSelected(List<SObject> selected) { }
	global String toString() { }

}