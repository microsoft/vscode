global class SaleRequest {
	global String accountId;
	global Double amount;
	global String comments;
	global String currencyIsoCode;
	global Datetime effectiveDate;
	global String legalEntityId;
	global String paymentGatewayId;
	global ConnectApi.PaymentGroupRequest paymentGroup;
	global ConnectApi.SaleApiPaymentMethodRequest paymentMethod;
	global Boolean submittedByMerchant;
	global SaleRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}