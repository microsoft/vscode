global class ProductSearchOutputRepresentation {
	global List<ConnectApi.ProductSearchFacetOutputRepresentation> facets;
	global Integer pageNumber;
	global Integer pageSize;
	global List<ConnectApi.ProductSearchProductOutputRepresentation> products;
	global Long totalRecordsFound;
	global ProductSearchOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}