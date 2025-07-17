global class MlRetrieverQueryResultDocumentRepresentation {
	global List<ConnectApi.MlRetrieverQueryResultDocumentCitationRepresentation> citations;
	global Double keywordSearchScore;
	global List<ConnectApi.MlRetrieverQueryResultDocumentContentRepresentation> result;
	global Double score;
	global Double vectorSearchScore;
	global MlRetrieverQueryResultDocumentRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}