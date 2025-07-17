global class CPQProductListOutputRepresentation {
	global List<ConnectApi.CPQCategoryOutputRepresentation> categories;
	global List<ConnectApi.CPQProductListOutputRepresentation> childProducts;
	global List<ConnectApi.CPQProductPricesOutputRepresentation> prices;
	global Integer variationsCount;
	global CPQProductListOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}