global class ShippingMethod {
	global Double amount;
	global Double amountValue;
	global String detail;
	global String detailValue;
	global String identifier;
	global String identifierValue;
	global String label;
	global String labelValue;
	global String shippingMethodType;
	global ShippingMethod(String label, Double amount, String detail, String identifier) { }
	global ShippingMethod() { }
	global Object clone() { }

}