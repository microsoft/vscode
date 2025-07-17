global class CdpQueryOutputV2 {
	global List<ConnectApi.CdpQueryV2Row> data;
	global String dataspace;
	global Boolean done;
	global String endTime;
	global Map<String,ConnectApi.CdpQueryMetadataItem> metadata;
	global String nextBatchId;
	global String queryId;
	global Integer rowCount;
	global String startTime;
	global CdpQueryOutputV2() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}