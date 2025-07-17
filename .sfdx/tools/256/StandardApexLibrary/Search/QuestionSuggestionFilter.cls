global class QuestionSuggestionFilter {
	global QuestionSuggestionFilter() { }
	/**
	 * Add a filter to display question belonging to the group having the id passed in argument
	 */
	global void addGroupId(String groupId) { }
	/**
	 * Add a filter to display question belonging to the network having the id passed in argument
	 */
	global void addNetworkId(String networkId) { }
	/**
	 * Add a filter to display question belonging to the user having the id passed in argument
	 */
	global void addUserId(String userId) { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	/**
	 * Add a filter to display question belonging to groups having ids passed in argument
	 */
	global void setGroupIds(List<String> groupIds) { }
	/**
	 * Add a filter to display question belonging to networks having ids passed in argument
	 */
	global void setNetworkIds(List<String> networkIds) { }
	/**
	 * Add a filter to display question belonging to the topic having the id passed in argument
	 */
	global void setTopicId(String topicId) { }
	/**
	 * Add a filter to display question belonging to users having ids passed in argument
	 */
	global void setUserIds(List<String> userIds) { }
	global String toString() { }

}