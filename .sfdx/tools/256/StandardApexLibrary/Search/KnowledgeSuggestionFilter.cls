global class KnowledgeSuggestionFilter {
	global KnowledgeSuggestionFilter() { }
	/**
	 * Add a filter to display article having the type passed in argument (you can add several article types)
	 */
	global void addArticleType(String articleType) { }
	/**
	 * Add the given category to filters
	 */
	global void addDataCategory(String dataCategoryGroupName, String dataCategoryName) { }
	/**
	 * Filter results with the topic passed in argument (you can add several topics)
	 */
	global void addTopic(String topic) { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	/**
	 * Set channel filter to the value passed in argument
	 */
	global void setChannel(String channelName) { }
	/**
	 * Set data categories filter to map passed in argument
	 */
	global void setDataCategories(Map<Object,Object> dataCategoryFilters) { }
	/**
	 * Set language filter to the value passed in argument
	 */
	global void setLanguage(String localeCode) { }
	/**
	 * Set publish status filter to the value passed in argument
	 */
	global void setPublishStatus(String publishStatus) { }
	/**
	 * Filter result with the validation status passed in argument
	 */
	global void setValidationStatus(String validationStatus) { }
	global String toString() { }

}