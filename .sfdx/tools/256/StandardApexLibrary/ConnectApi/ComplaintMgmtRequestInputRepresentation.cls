global class ComplaintMgmtRequestInputRepresentation {
	global String assessmentId;
	global ConnectApi.CaseInfoWrapper caseInfo;
	global List<ConnectApi.CaseParticipantInfoWrapper> caseParticipantInfo;
	global ConnectApi.ComplaintInfoWrapper complaintInfo;
	global List<ConnectApi.DocumentInfoAttributesWrapper> documentInfo;
	global Boolean shouldInclInRegulatoryRpt;
	global ComplaintMgmtRequestInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}