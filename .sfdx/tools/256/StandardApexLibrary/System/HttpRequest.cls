global class HttpRequest {
	global HttpRequest() { }
	global Boolean equals(Object obj) { }
	/**
	 * HTTP body
	 */
	global String getBody() { }
	/**
	 * HTTP body as blob
	 */
	global Blob getBodyAsBlob() { }
	/**
	 * returns XML body
	 */
	global dom.Document getBodyDocument() { }
	/**
	 * is compressed
	 */
	global Boolean getCompressed() { }
	/**
	 * Endpoint URL of the external server
	 */
	global String getEndpoint() { }
	/**
	 * Gets HTTP header for the given key
	 */
	global String getHeader(String key) { }
	/**
	 * Http request method
	 */
	global String getMethod() { }
	global Integer hashCode() { }
	/**
	 * sets HTTP body with string param
	 */
	global void setBody(String body) { }
	/**
	 * sets HTTP body with blob param
	 */
	global void setBodyAsBlob(Blob body) { }
	/**
	 * sets XML body
	 */
	global void setBodyDocument(Object body) { }
	/**
	 * sets client certificate and password
	 */
	global void setClientCertificate(String clientCert, String password) { }
	/**
	 * sets client certificate name
	 */
	global void setClientCertificateName(String certDevName) { }
	/**
	 * sets compressed request
	 */
	global void setCompressed(Boolean compressed) { }
	/**
	 * sets the endpoint URL of the external server
	 */
	global void setEndpoint(String endpoint) { }
	/**
	 * sets HTTP header for this request
	 */
	global void setHeader(String key, String value) { }
	/**
	 * sets the method type
	 */
	global void setMethod(String method) { }
	/**
	 * sets connection and read timeout
	 */
	global void setTimeout(Integer timeout) { }
	/**
	 * Returns a string that displays and identifies this object's properties.
	 */
	global String toString() { }

}