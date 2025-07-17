global class CdpAssetBase {
	global ConnectApi.CdpUser createdBy;
	global Datetime createdDate;
	global String id;
	global String label;
	global ConnectApi.CdpUser lastModifiedBy;
	global Datetime lastModifiedDate;
	global String name;
	global String namespace;
	global String url;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}