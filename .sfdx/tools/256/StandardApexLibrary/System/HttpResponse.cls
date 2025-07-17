global class HttpResponse {
	global HttpResponse() { }
	global Boolean equals(Object obj) { }
	/**
	 * HTTP body as string
	 */
	global String getBody() { }
	/**
	 * HTTP body as a blob
	 */
	global Blob getBodyAsBlob() { }
	/**
	 * HTTP body as XML DOM
	 */
	global dom.Document getBodyDocument() { }
	/**
	 * get HTTP header
	 */
	global String getHeader(String key) { }
	/**
	 * get HTTP headers
	 */
	global List<String> getHeaderKeys() { }
	/**
	 * HTTP status message
	 */
	global String getStatus() { }
	/**
	 * HTTP status code
	 */
	global Integer getStatusCode() { }
	/**
	 * HTTP body as XML stream reader
	 */
	global System.XmlStreamReader getXmlStreamReader() { }
	global Integer hashCode() { }
	/**
	 * sets the HTTP body as a string
	 */
	global void setBody(String body) { }
	/**
	 * sets the HTTP body as a blob
	 */
	global void setBodyAsBlob(Blob body) { }
	/**
	 * sets the header
	 */
	global void setHeader(String key, String value) { }
	/**
	 * sets the status
	 */
	global void setStatus(String status) { }
	/**
	 * sets the status code
	 */
	global void setStatusCode(Integer statusCode) { }
	/**
	 * Returns a string that displays and identifies this object's properties.
	 */
	global String toString() { }

}