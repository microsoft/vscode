global class SubmitCartToExchangeOrderInputRepresentation {
	global String exchangeCartId;
	global String orderNumber;
	global String orderSummaryId;
	global List<ConnectApi.PaymentInfoInputRepresentation> paymentInfoList;
	global String referenceId;
	global String reservationType;
	global List<ConnectApi.sharedOrderPaymentSummarySequenceInputRepresentation> sequences;
	global SubmitCartToExchangeOrderInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}