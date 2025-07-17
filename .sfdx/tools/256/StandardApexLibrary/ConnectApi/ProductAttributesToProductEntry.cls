global class ProductAttributesToProductEntry {
	global String canonicalKey;
	global ConnectApi.ProductMedia image;
	global List<ConnectApi.ProductMedia> mediaItems;
	global String productId;
	global List<ConnectApi.ProductAttributeSelectionInfo> selectedAttributes;
	global String urlName;
	global ProductAttributesToProductEntry() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}