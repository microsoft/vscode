global class PostAuthRequest {
	global String accountId;
	global Double amount;
	global String comments;
	global String currencyIsoCode;
	global Datetime effectiveDate;
	global String paymentGatewayId;
	global ConnectApi.PaymentGroupRequest paymentGroup;
	global ConnectApi.PostAuthApiPaymentMethodRequest paymentMethod;
	global PostAuthRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}