global class Search {
	/**
	 * retrieve rich search results from a dynamic SOSL query
	 */
	global static Search.SearchResults find(String searchQuery, System.AccessLevel accessLevel) { }
	/**
	 * retrieve rich search results from a dynamic SOSL query
	 */
	global static Search.SearchResults find(String searchQuery) { }
	/**
	 * dynamic SOSL query result
	 */
	global static List<List<SObject>> query(String searchQuery, System.AccessLevel accessLevel) { }
	/**
	 * dynamic SOSL query result
	 */
	global static List<List<SObject>> query(String searchQuery) { }
	/**
	 * suggest results for a query
	 */
	global static Search.SuggestionResults suggest(String searchQuery, String sObjectType, Object options, System.AccessLevel accessLevel) { }
	/**
	 * suggest results for a query
	 */
	global static Search.SuggestionResults suggest(String searchQuery, String sObjectType, Object options) { }

}