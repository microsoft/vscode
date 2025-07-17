global class AppFormContractDocumentVersionResponse {
	global List<ConnectApi.AppFormContentDocumentResponse> attachments;
	global Boolean canCurrentUserReview;
	global String contractDocumentVersionId;
	global List<ConnectApi.AppFormContentDocumentResponse> contractDocuments;
	global String contractId;
	global Boolean isDocumentVersionLocked;
	global String name;
	global String status;
	global AppFormContractDocumentVersionResponse() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}