global class DiscoverySearchActionResultsRepresentation {
	global List<ConnectApi.DiscoverySearchCategoryRepresentation> categories;
	global List<ConnectApi.DiscoverySearchFacetRepresentation> facets;
	global List<ConnectApi.DiscoverySearchProductRepresentation> products;
	global String recommendationCase;
	global Integer totalNumCategories;
	global Long totalNumSearchResults;
	global DiscoverySearchActionResultsRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}