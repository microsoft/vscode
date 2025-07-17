global class WishlistToCartResult {
	global String cartId;
	global List<ConnectApi.CartItemResult> failedWishlistToCartItems;
	global Integer productsFailedCount;
	global Integer productsRequestedCount;
	global Integer productsSucceededCount;
	global List<ConnectApi.CartItemResult> succeededWishlistToCartItems;
	global WishlistToCartResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}