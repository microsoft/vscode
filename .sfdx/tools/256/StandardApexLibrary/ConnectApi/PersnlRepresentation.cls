global class PersnlRepresentation {
	global List<String> attributes;
	global List<ConnectApi.PersnlAttributeRepresentation> contentAttributes;
	global List<ConnectApi.PersnlDiagnosticsRepresentation> diagnostics;
	global String persnlPointId;
	global String persnlPointName;
	global List<ConnectApi.PersnlRecommendationsOutputRepresentation> persnlRecommendations;
	global String personalizationId;
	global PersnlRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global List<String> getAttributes() { }
	global Double getBuildVersion() { }
	global List<ConnectApi.PersnlAttributeRepresentation> getContentAttributes() { }
	global List<ConnectApi.PersnlDiagnosticsRepresentation> getDiagnostics() { }
	global String getPersnlPointId() { }
	global String getPersnlPointName() { }
	global List<ConnectApi.PersnlRecommendationsOutputRepresentation> getPersnlRecommendations() { }
	global String getPersonalizationId() { }
	global Integer hashCode() { }
	global void setAttributes(List<String> value) { }
	global void setContentAttributes(List<ConnectApi.PersnlAttributeRepresentation> value) { }
	global void setDiagnostics(List<ConnectApi.PersnlDiagnosticsRepresentation> value) { }
	global void setPersnlPointId(String value) { }
	global void setPersnlPointName(String value) { }
	global void setPersnlRecommendations(List<ConnectApi.PersnlRecommendationsOutputRepresentation> value) { }
	global void setPersonalizationId(String value) { }
	global String toString() { }

}