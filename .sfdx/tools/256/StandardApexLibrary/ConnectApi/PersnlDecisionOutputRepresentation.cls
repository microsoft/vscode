global class PersnlDecisionOutputRepresentation {
	global List<ConnectApi.PersnlDiagnosticsRepresentation> diagnostics;
	global String persnlDataJson;
	global List<ConnectApi.PersnlRepresentation> personalizations;
	global String requestId;
	global PersnlDecisionOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global List<ConnectApi.PersnlDiagnosticsRepresentation> getDiagnostics() { }
	global String getPersnlDataJson() { }
	global List<ConnectApi.PersnlRepresentation> getPersonalizations() { }
	global String getRequestId() { }
	global Integer hashCode() { }
	global void setDiagnostics(List<ConnectApi.PersnlDiagnosticsRepresentation> value) { }
	global void setPersnlDataJson(String value) { }
	global void setPersonalizations(List<ConnectApi.PersnlRepresentation> value) { }
	global void setRequestId(String value) { }
	global String toString() { }

}