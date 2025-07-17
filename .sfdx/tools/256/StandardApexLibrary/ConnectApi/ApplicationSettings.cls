global class ApplicationSettings {
	global Datetime aiAppLastModifiedDate;
	global String aiApplicationType;
	global String apiName;
	global String appProvisionStatus;
	global String applicationId;
	global Datetime configLastModifiedDate;
	global String masterLabel;
	global List<ConnectApi.PredictionField> predictionFields;
	global Integer rank;
	global String state;
	global ApplicationSettings() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}