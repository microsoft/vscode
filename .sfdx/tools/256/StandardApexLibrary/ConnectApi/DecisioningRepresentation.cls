global class DecisioningRepresentation {
	global List<ConnectApi.DecisioningPersonalizationDiagnosticsRepresentation> diagnostics;
	global List<ConnectApi.DecisioningPersonalizationRepresentation> personalizations;
	global String requestId;
	global DecisioningRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global List<ConnectApi.DecisioningPersonalizationDiagnosticsRepresentation> getDiagnostics() { }
	global List<ConnectApi.DecisioningPersonalizationRepresentation> getPersonalizations() { }
	global String getRequestId() { }
	global Integer hashCode() { }
	global void setDiagnostics(List<ConnectApi.DecisioningPersonalizationDiagnosticsRepresentation> value) { }
	global void setPersonalizations(List<ConnectApi.DecisioningPersonalizationRepresentation> value) { }
	global void setRequestId(String value) { }
	global String toString() { }

}