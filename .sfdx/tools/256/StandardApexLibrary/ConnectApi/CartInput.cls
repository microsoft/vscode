global class CartInput {
	global String currencyIsoCode;
	global List<SObject> customFields;
	global String effectiveAccountId;
	global Boolean isSecondary;
	global String name;
	global String orderOwnerId;
	global ConnectApi.CartType type;
	global String typeAsString;
	global CartInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}