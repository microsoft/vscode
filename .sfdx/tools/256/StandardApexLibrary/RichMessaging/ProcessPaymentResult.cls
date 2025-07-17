global class ProcessPaymentResult {
	global String errorMessage;
	global RichMessaging.ProcessPaymentResultStatus resultStatus;
	global ProcessPaymentResult(RichMessaging.ProcessPaymentResultStatus resultStatus, String errorMessage) { }
	global ProcessPaymentResult(RichMessaging.ProcessPaymentResultStatus resultStatus) { }
	global Object clone() { }

}