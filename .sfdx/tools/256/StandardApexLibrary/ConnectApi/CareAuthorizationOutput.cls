global class CareAuthorizationOutput {
	global List<ConnectApi.CareDiagnosisOutput> careDiagnoses;
	global List<ConnectApi.CareProcessingErrorOutput> careProcessingErrors;
	global ConnectApi.CareRequestOutput careRequest;
	global ConnectApi.CareAuthorizationCaseOutput careRequestCase;
	global List<ConnectApi.CareRequestDrugOutput> careRequestDrugs;
	global List<ConnectApi.CareRequestItemOutput> careRequestItems;
	global ConnectApi.CareAuthorizationPatientOutput patient;
	global ConnectApi.SubscriberOutput subscriber;
	global List<ConnectApi.TrackedCommunicationOutput> trackedCommunications;
	global List<ConnectApi.TransportLocationOutput> transportLocations;
	global CareAuthorizationOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}