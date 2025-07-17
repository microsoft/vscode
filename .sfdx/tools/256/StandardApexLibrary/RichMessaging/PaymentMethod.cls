global class PaymentMethod {
	global String displayName;
	global String network;
	global String paymentType;
	global PaymentMethod(String network, String paymentType, String displayName) { }
	global Object clone() { }

}