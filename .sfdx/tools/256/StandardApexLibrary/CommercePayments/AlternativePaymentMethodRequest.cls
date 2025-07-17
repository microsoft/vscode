global class AlternativePaymentMethodRequest {
	global String accountId;
	global String email;
	global String gatewayToken;
	global String gatewayTokenDetails;
	global String name;
	global AlternativePaymentMethodRequest(String gatewayToken) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}