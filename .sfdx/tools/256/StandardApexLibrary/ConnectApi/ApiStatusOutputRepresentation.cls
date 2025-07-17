global class ApiStatusOutputRepresentation {
	global List<ConnectApi.CpqMessageOutputRepresentation> messages;
	global ConnectApi.ApiResponseStatusCode statusCode;
	global String statusMessage;
	global ApiStatusOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}