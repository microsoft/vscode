global class PreserveCart {
	global String cartId;
	global String currencyIsoCode;
	global List<ConnectApi.CartItemBasicResult> failedCartItems;
	global Integer numberOfProducts;
	global Integer numberOfProductsWithError;
	global Integer numberOfProductsWithSuccess;
	global List<ConnectApi.CartItemBasicResult> succeededCartItems;
	global PreserveCart() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}