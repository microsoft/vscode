global class BaseRequest {
	global Map<String,String> additionalData;
	global Boolean duplicate;
	global String idempotencyKey;
	global BaseRequest(Boolean duplicate, String idempotencyKey) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}