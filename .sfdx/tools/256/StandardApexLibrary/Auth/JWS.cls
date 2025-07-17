global class JWS {
	global JWS(Auth.JWT jwt, String certDevName) { }
	global JWS(String payload, String certDevName) { }
	global Object clone() { }
	global String getCompactSerialization() { }

}