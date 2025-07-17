global class EncryptedPaymentDataHeader {
	global String applicationData;
	global String ephemeralPublicKey;
	global String publicKeyHash;
	global String transactionId;
	global EncryptedPaymentDataHeader(String transactionId, String publicKeyHash, String ephemeralPublicKey, String applicationData) { }
	global Object clone() { }

}