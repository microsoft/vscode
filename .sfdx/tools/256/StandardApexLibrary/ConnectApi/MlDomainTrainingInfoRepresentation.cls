global class MlDomainTrainingInfoRepresentation {
	global Boolean isTrainable;
	global Map<String,Integer> lowIntentUtteranceCounts;
	global ConnectApi.MlDomainTrainingErrorType notTrainableReason;
	global MlDomainTrainingInfoRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}