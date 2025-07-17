global class InvoiceRecoveryResult {
	global List<ConnectApi.BillingScheduleRecoveryResult> billingSchedules;
	global List<ConnectApi.ErrorResponse> invoiceErrors;
	global String invoiceId;
	global String invoiceStatus;
	global Boolean success;
	global InvoiceRecoveryResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}