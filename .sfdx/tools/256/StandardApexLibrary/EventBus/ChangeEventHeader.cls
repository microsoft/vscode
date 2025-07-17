global class ChangeEventHeader {
	global List<String> changedfields;
	global String changeorigin;
	global String changetype;
	global Long commitnumber;
	global Long committimestamp;
	global String commituser;
	global List<String> difffields;
	global String entityname;
	global List<String> nulledfields;
	global List<String> recordids;
	global Integer sequencenumber;
	global String transactionkey;
	global ChangeEventHeader() { }
	global Boolean equals(Object obj) { }
	global String getChangeOrigin() { }
	global String getChangeType() { }
	global List<String> getChangedFields() { }
	global Long getCommitNumber() { }
	global Long getCommitTimestamp() { }
	global String getCommitUser() { }
	global List<String> getDiffFields() { }
	global String getEntityName() { }
	global List<String> getNulledFields() { }
	global List<String> getRecordIds() { }
	global Integer getSequenceNumber() { }
	global String getTransactionKey() { }
	global Integer hashCode() { }
	global void setChangeOrigin(String param0) { }
	global void setChangeType(String param0) { }
	global void setChangedFields(List<String> param0) { }
	global void setCommitNumber(Long param0) { }
	global void setCommitTimestamp(Long param0) { }
	global void setCommitUser(String param0) { }
	global void setDiffFields(List<String> param0) { }
	global void setEntityName(String param0) { }
	global void setNulledFields(List<String> param0) { }
	global void setRecordIds(List<String> param0) { }
	global void setSequenceNumber(Integer param0) { }
	global void setTransactionKey(String param0) { }
	global String toString() { }

}