global class Url {
	global Url(String protocol, String host, Integer port, String file) { }
	global Url(String protocol, String host, String file) { }
	global Url(System.Url context, String spec) { }
	global Url(String spec) { }
	global Object clone() { }
	global String getAuthority() { }
	global static System.Url getCurrentRequestUrl() { }
	global Integer getDefaultPort() { }
	global String getFile() { }
	global static String getFileFieldURL(String objectId, String fieldName) { }
	global String getHost() { }
	global static System.Url getOrgDomainUrl() { }
	global String getPath() { }
	global Integer getPort() { }
	global String getProtocol() { }
	global String getQuery() { }
	global String getRef() { }
	global static System.Url getSalesforceBaseUrl() { }
	global String getUserInfo() { }
	global Boolean sameFile(System.Url other) { }
	global String toExternalForm() { }
	global String toString() { }

}