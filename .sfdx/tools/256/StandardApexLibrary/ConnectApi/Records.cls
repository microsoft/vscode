global class Records {
	global Object clone() { }
	global static ConnectApi.Motif getMotif(String communityId, String idOrPrefix) { }
	global static List<ConnectApi.BatchResult> getMotifBatch(String communityId, List<String> idOrPrefixList) { }

}