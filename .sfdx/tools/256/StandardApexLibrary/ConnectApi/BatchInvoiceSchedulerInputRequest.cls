global class BatchInvoiceSchedulerInputRequest {
	global List<ConnectApi.BatchInvoiceFilterCriteriaInputRequest> filterCriteria;
	global String invoiceDate;
	global Integer invoiceDateOffset;
	global ConnectApi.BatchInvoiceStatusEnum invoiceStatus;
	global Boolean isInvoiceDateFromRunDate;
	global String targetDate;
	global Integer targetDateOffset;
	global BatchInvoiceSchedulerInputRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}