global class Provider {
	global Provider() { }
	global Object clone() { }
	global List<DataSource.AuthenticationCapability> getAuthenticationCapabilities() { }
	global List<DataSource.Capability> getCapabilities() { }
	global DataSource.Connection getConnection(DataSource.ConnectionParams param0) { }
	global void logWarning(String msg) { }
	global void throwException(String msg) { }

}