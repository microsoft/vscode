global class OrderToCartResult {
	global String cartId;
	global Integer totalFailedProductCount;
	global Integer totalSucceededProductCount;
	global List<ConnectApi.OrderToCartFailedProduct> unaddedProducts;
	global OrderToCartResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}