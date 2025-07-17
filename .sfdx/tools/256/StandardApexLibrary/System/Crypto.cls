global class Crypto {
	global Crypto() { }
	global Object clone() { }
	global static Blob decrypt(String algorithmName, Blob secretKey, Blob initializationVector, Blob encryptedData) { }
	global static Blob decryptWithManagedIV(String algorithmName, Blob secretKey, Blob encryptedData, Blob aaData) { }
	global static Blob decryptWithManagedIV(String algorithmName, Blob secretKey, Blob encryptedData) { }
	global static Blob encrypt(String algorithmName, Blob secretKey, Blob initializationVector, Blob clearData) { }
	global static Blob encryptWithManagedIV(String algorithmName, Blob secretKey, Blob clearData, Blob aaData) { }
	global static Blob encryptWithManagedIV(String algorithmName, Blob secretKey, Blob clearData) { }
	global static Blob generateAesKey(Integer size) { }
	global static Blob generateDigest(String algorithmName, Blob input) { }
	global static Blob generateMac(String algorithmName, Blob input, Blob privateKey) { }
	global static Integer getRandomInteger() { }
	global static Long getRandomLong() { }
	global static Blob sign(String algorithmName, Blob input, Blob privateKey) { }
	global static Blob signWithCertificate(String algorithmName, Blob input, String certDevName) { }
	global static void signXml(String algorithmName, dom.XmlNode node, String idAttributeName, String certDevName, dom.XmlNode refChild) { }
	global static void signXml(String algorithmName, dom.XmlNode node, String idAttributeName, String certDevName) { }
	global static Boolean verify(String algorithmName, Blob data, Blob signature, Blob publicKey) { }
	global static Boolean verify(String algorithmName, Blob data, Blob signature, String certDevName) { }
	global static Boolean verifyHmac(String algorithmName, Blob data, Blob privateKey, Blob hmacToVerify) { }

}