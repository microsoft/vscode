global class AbstractResponse {
	global AbstractResponse() { }
	global Object clone() { }
	global void setGatewayAvsCode(String gatewayAvsCode) { }
	global void setGatewayDate(Datetime gatewayDate) { }
	global void setGatewayMessage(String gatewayMessage) { }
	global void setGatewayResultCode(String gatewayResultCode) { }
	global void setGatewayResultCodeDescription(String gatewayResultCodeDescription) { }
	global void setSalesforceResultCodeInfo(commercepayments.SalesforceResultCodeInfo salesforceResultCodeInfo) { }

}