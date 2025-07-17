global class InvoiceInputRepresentation {
	global String accountId;
	global ConnectApi.InvoiceAction action;
	global List<String> billingScheduleIds;
	global String billingTransactionId;
	global ConnectApi.InvoiceAPIConfigurationOverride configurationOverrides;
	global String correlationId;
	global String invoiceDate;
	global String targetDate;
	global InvoiceInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}