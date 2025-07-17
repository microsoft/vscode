global class AuthorizationReversalRequest {
	global String accountId;
	global Double amount;
	global String paymentAuthorizationId;
	global AuthorizationReversalRequest(Double amount, String authorizationId) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}