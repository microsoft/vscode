global class CaptureRequest {
	global String accountId;
	global Double amount;
	global String clientContext;
	global String comments;
	global Datetime effectiveDate;
	global Boolean isFinalCapture;
	global ConnectApi.PaymentGroupRequest paymentGroup;
	global CaptureRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}