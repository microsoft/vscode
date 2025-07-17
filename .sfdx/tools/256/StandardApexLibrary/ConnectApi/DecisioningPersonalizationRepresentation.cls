global class DecisioningPersonalizationRepresentation {
	global List<String> attributes;
	global List<ConnectApi.DecisioningPersonalizationDataRepresentation> data;
	global List<ConnectApi.DecisioningPersonalizationDiagnosticsRepresentation> diagnostics;
	global String personalizationId;
	global String personalizationPointId;
	global String personalizationPointName;
	global DecisioningPersonalizationRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global List<String> getAttributes() { }
	global Double getBuildVersion() { }
	global List<ConnectApi.DecisioningPersonalizationDataRepresentation> getData() { }
	global List<ConnectApi.DecisioningPersonalizationDiagnosticsRepresentation> getDiagnostics() { }
	global String getPersonalizationId() { }
	global String getPersonalizationPointId() { }
	global String getPersonalizationPointName() { }
	global Integer hashCode() { }
	global void setAttributes(List<String> value) { }
	global void setData(List<ConnectApi.DecisioningPersonalizationDataRepresentation> value) { }
	global void setDiagnostics(List<ConnectApi.DecisioningPersonalizationDiagnosticsRepresentation> value) { }
	global void setPersonalizationId(String value) { }
	global void setPersonalizationPointId(String value) { }
	global void setPersonalizationPointName(String value) { }
	global String toString() { }

}