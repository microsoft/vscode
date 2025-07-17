global class VerificationContextOutputRepresentation {
	global Boolean isSuccess;
	global String message;
	global ConnectApi.ProcessDefinitionOutputRepresentation processDefinition;
	global ConnectApi.SelectedSearchResultOutputRepresentation selectedSearchResult;
	global ConnectApi.SelectedVerifiedResultOutputRepresentation selectedVerifiedResult;
	global ConnectApi.VerifiedResultOutputRepresentation verifiedResult;
	global VerificationContextOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}