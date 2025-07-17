global class JWTUtil {
	global JWTUtil() { }
	global Object clone() { }
	global static Auth.JWT parseJWTFromStringWithoutValidation(String incomingJWT) { }
	global static Auth.JWT validateJWTWithCert(String incomingJWT, String certDeveloperName) { }
	global static Auth.JWT validateJWTWithKey(String incomingJWT, String publicKey) { }
	global static Auth.JWT validateJWTWithKeysEndpoint(String incomingJWT, String keysEndpoint, Boolean shouldUseCache) { }

}