global class SaleRequest {
	global String accountId;
	global Double amount;
	global String comments;
	global String currencyIsoCode;
	global commercepayments.SaleApiPaymentMethodRequest paymentMethod;
	global Boolean submittedByMerchant;
	global SaleRequest(Double amount) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}