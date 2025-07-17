global class EncryptedPaymentData {
	global String data;
	global RichMessaging.EncryptedPaymentDataHeader header;
	global String signature;
	global String version;
	global EncryptedPaymentData(RichMessaging.EncryptedPaymentDataHeader header, String data, String signature, String version) { }
	global Object clone() { }

}