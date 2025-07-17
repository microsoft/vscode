global class CreateGiftRequest {
	global Double amount;
	global ConnectApi.CampaignDetails campaign;
	global ConnectApi.GiftCommitmentLookupDetails commitment;
	global String commitmentId;
	global String currencyIsoCode;
	global List<ConnectApi.DesignationDetails> designations;
	global ConnectApi.DonorDetails donor;
	global Double donorCoverAmount;
	global String gatewayReference;
	global Double gatewayTransactionFee;
	global List<ConnectApi.CustomFieldDetails> giftTransactionCustomFields;
	global String lastGatewayErrorMessage;
	global String lastGatewayProcessedDateTime;
	global String lastGatewayResponseCode;
	global ConnectApi.OutreachSourceCodeDetails outreachSourceCode;
	global String paymentIdentifier;
	global ConnectApi.PaymentInstrumentDetails paymentInstrument;
	global String processorReference;
	global Double processorTransactionFee;
	global String receivedDate;
	global String transactionStatus;
	global CreateGiftRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}