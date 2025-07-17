global class Cookie {
	global Cookie(String name, String value, String path, Integer maxAge, Boolean isSecure, String sameSite, Boolean isHttpOnly) { }
	global Cookie(String name, String value, String path, Integer maxAge, Boolean isSecure, String sameSite) { }
	global Cookie(String name, String value, String path, Integer maxAge, Boolean isSecure) { }
	global Boolean equals(Object obj) { }
	/**
	 * Get cookie domain
	 */
	global String getDomain() { }
	/**
	 * Get cookie max age
	 */
	global Integer getMaxAge() { }
	/**
	 * Get cookie name
	 */
	global String getName() { }
	/**
	 * Get cookie path
	 */
	global String getPath() { }
	/**
	 * Get cookie sameSite
	 */
	global String getSameSite() { }
	/**
	 * Get cookie value
	 */
	global String getValue() { }
	global Integer hashCode() { }
	/**
	 * Get cookie isHttpOnly
	 */
	global Boolean isHttpOnly() { }
	/**
	 * Is secure cookie
	 */
	global Boolean isSecure() { }
	global String toString() { }

}