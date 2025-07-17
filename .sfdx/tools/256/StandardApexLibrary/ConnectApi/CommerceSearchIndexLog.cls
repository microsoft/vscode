global class CommerceSearchIndexLog {
	global Datetime catalogSnapshotTime;
	global Datetime completionDate;
	global String createdById;
	global ConnectApi.CommerceSearchIndexStatus indexBuildStatus;
	global ConnectApi.CommerceSearchIndexBuildType indexBuildType;
	global ConnectApi.CommerceSearchIndexCreationType indexCreationType;
	global String indexId;
	global String message;
	global Integer numberOfProducts;
	global CommerceSearchIndexLog() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}