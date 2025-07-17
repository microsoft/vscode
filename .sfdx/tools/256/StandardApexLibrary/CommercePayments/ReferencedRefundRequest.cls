global class ReferencedRefundRequest {
	global String PaymentId;
	global String accountId;
	global Double amount;
	global ReferencedRefundRequest(Double amount, String paymentId) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}