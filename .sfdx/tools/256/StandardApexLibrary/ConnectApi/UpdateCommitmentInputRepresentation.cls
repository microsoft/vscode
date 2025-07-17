global class UpdateCommitmentInputRepresentation {
	global Double amount;
	global ConnectApi.CampaignDetails campaign;
	global String currencyIsoCode;
	global ConnectApi.DonorDetails donor;
	global String endDate;
	global List<ConnectApi.CustomFieldDetails> giftCommitmentCustomFields;
	global List<ConnectApi.CustomFieldDetails> giftCommitmentScheduleCustomFields;
	global ConnectApi.OutreachSourceCodeDetails outreachSourceCode;
	global ConnectApi.PaymentInstrumentDetails paymentInstrument;
	global String startDate;
	global String transactionDay;
	global Integer transactionInterval;
	global String transactionPeriod;
	global UpdateCommitmentInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}