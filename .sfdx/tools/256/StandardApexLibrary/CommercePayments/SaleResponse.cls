global class SaleResponse {
	global SaleResponse() { }
	global Object clone() { }
	global void setAmount(Double amount) { }
	global void setGatewayAvsCode(String gatewayAvsCode) { }
	global void setGatewayDate(Datetime gatewayDate) { }
	global void setGatewayMessage(String gatewayMessage) { }
	global void setGatewayReferenceDetails(String gatewayReferenceDetails) { }
	global void setGatewayReferenceNumber(String gatewayReferenceNumber) { }
	global void setGatewayResultCode(String gatewayResultCode) { }
	global void setGatewayResultCodeDescription(String gatewayResultCodeDescription) { }
	global void setPaymentMethodTokenizationResponse(commercepayments.PaymentMethodTokenizationResponse paymentMethodTokenizationResponse) { }
	global void setSalesforceResultCodeInfo(commercepayments.SalesforceResultCodeInfo salesforceResultCodeInfo) { }

}