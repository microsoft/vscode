global class ProductSearchInput {
	global String categoryId;
	global List<String> fields;
	global ConnectApi.ProductSearchGroupingInput grouping;
	global Boolean includePrices;
	global Boolean includeQuantityRule;
	global Integer page;
	global Integer pageSize;
	global List<ConnectApi.RefinementInput> refinements;
	global String searchTerm;
	global String sortRuleId;
	global ProductSearchInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global String getCategoryId() { }
	global List<String> getFields() { }
	global ConnectApi.ProductSearchGroupingInput getGrouping() { }
	global Boolean getIncludePrices() { }
	global Boolean getIncludeQuantityRule() { }
	global Integer getPage() { }
	global Integer getPageSize() { }
	global List<ConnectApi.RefinementInput> getRefinements() { }
	global String getSearchTerm() { }
	global String getSortRuleId() { }
	global Integer hashCode() { }
	global void setCategoryId(String value) { }
	global void setFields(List<String> value) { }
	global void setGrouping(ConnectApi.ProductSearchGroupingInput value) { }
	global void setIncludePrices(Boolean value) { }
	global void setIncludeQuantityRule(Boolean value) { }
	global void setPage(Integer value) { }
	global void setPageSize(Integer value) { }
	global void setRefinements(List<ConnectApi.RefinementInput> value) { }
	global void setSearchTerm(String value) { }
	global void setSortRuleId(String value) { }
	global String toString() { }

}