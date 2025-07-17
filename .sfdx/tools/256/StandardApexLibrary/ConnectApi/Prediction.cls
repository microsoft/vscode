global class Prediction {
	global Double historyRefPointScore;
	global List<ConnectApi.Insight> insights;
	global List<String> missingColumns;
	global List<ConnectApi.Column> outOfBoundsColumns;
	global Double score;
	global Prediction() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}