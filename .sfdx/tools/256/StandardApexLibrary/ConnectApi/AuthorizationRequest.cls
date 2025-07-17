global class AuthorizationRequest {
	global String accountId;
	global Double amount;
	global String comments;
	global String currencyIsoCode;
	global Datetime effectiveDate;
	global String paymentGatewayId;
	global ConnectApi.PaymentGroupRequest paymentGroup;
	global ConnectApi.AuthApiPaymentMethodRequest paymentMethod;
	global AuthorizationRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}