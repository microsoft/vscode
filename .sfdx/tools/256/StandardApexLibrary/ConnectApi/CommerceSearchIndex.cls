global class CommerceSearchIndex {
	global Datetime completionDate;
	global Datetime createdDate;
	global ConnectApi.CommerceSearchIndexCreationType creationType;
	global String id;
	global ConnectApi.CommerceSearchIndexBuildType indexBuildType;
	global ConnectApi.CommerceSearchIndexStatus indexStatus;
	global ConnectApi.CommerceSearchIndexUsage indexUsage;
	global Boolean isIncrementable;
	global Datetime lastCatalogSnapshotTime;
	global String message;
	global CommerceSearchIndex() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}