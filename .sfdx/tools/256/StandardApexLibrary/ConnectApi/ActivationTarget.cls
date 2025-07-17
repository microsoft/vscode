global class ActivationTarget {
	global ConnectApi.DataConnector connector;
	global String dataSpace;
	global String description;
	global String historyAudienceDmoApiName;
	global String historyAudienceDmoLabel;
	global Boolean isCappingEnabled;
	global Boolean isEnabled;
	global String latestAudienceDmoApiName;
	global String latestAudienceDmoLabel;
	global String organizationId;
	global String platformName;
	global String platformPrivacyType;
	global ConnectApi.DataConnectorType platformType;
	global ConnectApi.ActivationTargetStatus status;
	global ActivationTarget() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}