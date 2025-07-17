global class RateLimitException extends Exception {
	global Object clone() { }
	global String getErrorCode() { }
	global String getTypeName() { }

}