global class CommerceAddressCollection {
	global Integer count;
	global String currentPageToken;
	global String currentPageUrl;
	global List<ConnectApi.CommerceAddressOutput> items;
	global String nextPageToken;
	global String nextPageUrl;
	global Integer pageSize;
	global String previousPageToken;
	global String previousPageUrl;
	global ConnectApi.CommerceAddressSort sortOrder;
	global CommerceAddressCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer getCount() { }
	global String getCurrentPageToken() { }
	global String getCurrentPageUrl() { }
	global List<ConnectApi.CommerceAddressOutput> getItems() { }
	global String getNextPageToken() { }
	global String getNextPageUrl() { }
	global Integer getPageSize() { }
	global String getPreviousPageToken() { }
	global String getPreviousPageUrl() { }
	global ConnectApi.CommerceAddressSort getSortOrder() { }
	global Integer hashCode() { }
	global void setCount(Integer value) { }
	global void setCurrentPageToken(String value) { }
	global void setCurrentPageUrl(String value) { }
	global void setItems(List<ConnectApi.CommerceAddressOutput> value) { }
	global void setNextPageToken(String value) { }
	global void setNextPageUrl(String value) { }
	global void setPageSize(Integer value) { }
	global void setPreviousPageToken(String value) { }
	global void setPreviousPageUrl(String value) { }
	global void setSortOrder(ConnectApi.CommerceAddressSort value) { }
	global String toString() { }

}