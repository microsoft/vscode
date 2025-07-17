global class CartItemCollection {
	global List<String> approachingDiscounts;
	global ConnectApi.CartCouponCollection cartCoupons;
	global List<ConnectApi.CartItemResult> cartItems;
	global ConnectApi.CartPromotionCollection cartPromotions;
	global ConnectApi.CartSummary cartSummary;
	global Integer count;
	global Integer currentPage;
	global String currentPageToken;
	global String currentPageUrl;
	global Boolean hasErrors;
	global String nextPageToken;
	global String nextPageUrl;
	global String previousPageToken;
	global String previousPageUrl;
	global Integer total;
	global Integer totalNumberOfPages;
	global CartItemCollection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global List<String> getApproachingDiscounts() { }
	global Double getBuildVersion() { }
	global ConnectApi.CartCouponCollection getCartCoupons() { }
	global List<ConnectApi.CartItemResult> getCartItems() { }
	global ConnectApi.CartPromotionCollection getCartPromotions() { }
	global ConnectApi.CartSummary getCartSummary() { }
	global Integer getCount() { }
	global Integer getCurrentPage() { }
	global String getCurrentPageToken() { }
	global String getCurrentPageUrl() { }
	global Boolean getHasErrors() { }
	global String getNextPageToken() { }
	global String getNextPageUrl() { }
	global String getPreviousPageToken() { }
	global String getPreviousPageUrl() { }
	global Integer getTotal() { }
	global Integer getTotalNumberOfPages() { }
	global Integer hashCode() { }
	global void setApproachingDiscounts(List<String> value) { }
	global void setCartCoupons(ConnectApi.CartCouponCollection value) { }
	global void setCartItems(List<ConnectApi.CartItemResult> value) { }
	global void setCartPromotions(ConnectApi.CartPromotionCollection value) { }
	global void setCartSummary(ConnectApi.CartSummary value) { }
	global void setCount(Integer value) { }
	global void setCurrentPage(Integer value) { }
	global void setCurrentPageToken(String value) { }
	global void setCurrentPageUrl(String value) { }
	global void setHasErrors(Boolean value) { }
	global void setNextPageToken(String value) { }
	global void setNextPageUrl(String value) { }
	global void setPreviousPageToken(String value) { }
	global void setPreviousPageUrl(String value) { }
	global void setTotal(Integer value) { }
	global void setTotalNumberOfPages(Integer value) { }
	global String toString() { }

}