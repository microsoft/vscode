global class ProductSearchResults {
	global ConnectApi.SearchCategory categories;
	global String correlationId;
	global List<ConnectApi.SearchFacet> facets;
	global String locale;
	global ConnectApi.ProductSummaryPage productsPage;
	global ProductSearchResults() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global ConnectApi.SearchCategory getCategories() { }
	global String getCorrelationId() { }
	global List<ConnectApi.SearchFacet> getFacets() { }
	global String getLocale() { }
	global ConnectApi.ProductSummaryPage getProductsPage() { }
	global Integer hashCode() { }
	global void setCategories(ConnectApi.SearchCategory value) { }
	global void setCorrelationId(String value) { }
	global void setFacets(List<ConnectApi.SearchFacet> value) { }
	global void setLocale(String value) { }
	global void setProductsPage(ConnectApi.ProductSummaryPage value) { }
	global String toString() { }

}