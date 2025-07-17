global class AbstractRepositoryItem {
	global String createdBy;
	global Datetime createdDate;
	global String description;
	global String id;
	global String itemTypeUrl;
	global String modifiedBy;
	global Datetime modifiedDate;
	global ConnectApi.Motif motif;
	global String name;
	global ConnectApi.Reference repository;
	global String type;
	global String url;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}