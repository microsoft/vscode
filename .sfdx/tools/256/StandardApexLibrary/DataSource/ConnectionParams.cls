global class ConnectionParams {
	global String certificateName;
	global String endpoint;
	global String oauthToken;
	global String password;
	global DataSource.IdentityType principalType;
	global DataSource.AuthenticationProtocol protocol;
	global String repository;
	global String username;
	global ConnectionParams() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }

}