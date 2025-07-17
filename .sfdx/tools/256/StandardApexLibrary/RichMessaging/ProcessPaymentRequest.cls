global class ProcessPaymentRequest {
	global RichMessaging.AddressableContact billingContact;
	global String contextRecordId;
	global RichMessaging.EncryptedPaymentData paymentData;
	global RichMessaging.PaymentMethod paymentMethod;
	global RichMessaging.AddressableContact shippingContact;
	global RichMessaging.ShippingMethod shippingMethod;
	global String transactionIdentifier;
	global ProcessPaymentRequest(String transactionIdentifier, RichMessaging.EncryptedPaymentData paymentData, RichMessaging.AddressableContact billingContact, RichMessaging.AddressableContact shippingContact, RichMessaging.PaymentMethod paymentMethod, RichMessaging.ShippingMethod shippingMethod, String contextRecordId) { }
	global Object clone() { }

}