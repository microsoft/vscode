global class WriteOffInvoiceResponse {
	global InvoiceWriteOff.WriteOffInvoiceResponseError errors;
	global String invoiceId;
	global String requestIdentifier;
	global Boolean success;
	global WriteOffInvoiceResponse(InvoiceWriteOff.WriteOffInvoiceResponseError errors, String invoiceId, String requestIdentifier, Boolean success) { }
	global Object clone() { }

}