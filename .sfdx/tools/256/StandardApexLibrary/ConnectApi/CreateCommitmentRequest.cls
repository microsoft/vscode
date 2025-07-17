global class CreateCommitmentRequest {
	global Double amount;
	global ConnectApi.CampaignDetails campaign;
	global String currencyIsoCode;
	global List<ConnectApi.DesignationDetails> designations;
	global ConnectApi.DonorDetails donor;
	global String endDate;
	global ConnectApi.TransactionDetails firstTransaction;
	global List<ConnectApi.CustomFieldDetails> giftCommitmentCustomFields;
	global List<ConnectApi.CustomFieldDetails> giftCommitmentScheduleCustomFields;
	global ConnectApi.OutreachSourceCodeDetails outreachSourceCode;
	global ConnectApi.PaymentInstrumentDetails paymentInstrument;
	global String paymentProcessorCommitmentId;
	global String startDate;
	global String transactionDay;
	global Integer transactionInterval;
	global String transactionPeriod;
	global String type;
	global CreateCommitmentRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}