global class MergeRequest {
	global List<Datacloud.AdditionalInformationMap> additionalinformationmap;
	global SObject masterrecord;
	global List<String> recordtomergeids;
	global MergeRequest() { }
	global Boolean equals(Object obj) { }
	global List<Datacloud.AdditionalInformationMap> getAdditionalInformationMap() { }
	global SObject getMasterRecord() { }
	global List<String> getRecordToMergeIds() { }
	global Integer hashCode() { }
	global void setAdditionalInformationMap(List<Datacloud.AdditionalInformationMap> param0) { }
	global void setMasterRecord(SObject param0) { }
	global void setRecordToMergeIds(List<String> param0) { }
	global String toString() { }

}