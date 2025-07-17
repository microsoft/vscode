global class InvoiceOutputRepresentation {
	global List<ConnectApi.BillingScheduleOutputRepresentation> billingSchedules;
	global List<ConnectApi.ErrorResponse> invoiceErrors;
	global String invoiceId;
	global ConnectApi.InvoiceStatusEnum invoiceStatus;
	global Boolean isSuccess;
	global InvoiceOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}