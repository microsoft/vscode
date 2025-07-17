global class SavedPaymentMethodOutput {
	global String accountHolderEmail;
	global String accountHolderName;
	global String bankAccountType;
	global String bankCode;
	global String bankName;
	global ConnectApi.ErrorResponse error;
	global String expiryMonth;
	global String expiryYear;
	global String gatewayCustomerReference;
	global String gatewayRefId;
	global String gatewayReference;
	global String gatewayToken;
	global String id;
	global Boolean isDefault;
	global Boolean isOwner;
	global Boolean isSharedWithinSameAccount;
	global String issuer;
	global String last4;
	global String merchantAccountId;
	global String name;
	global String network;
	global String paymentGatewayId;
	global String referenceOwnerId;
	global Boolean savedByMerchant;
	global ConnectApi.SavedPaymentMethodStatus status;
	global ConnectApi.SavedPaymentMethodType type;
	global ConnectApi.SavedPaymentMethodUsageType usageType;
	global SavedPaymentMethodOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}