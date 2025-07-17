global class PredictionObject {
	global Map<String,String> model;
	global ConnectApi.Prediction prediction;
	global String status;
	global List<ConnectApi.Suggestion> suggestions;
	global PredictionObject() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}