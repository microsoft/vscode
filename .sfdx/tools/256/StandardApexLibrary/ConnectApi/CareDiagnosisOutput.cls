global class CareDiagnosisOutput {
	global List<ConnectApi.CareRequestReviewerOutput> careRequestReviewers;
	global String codeDescription;
	global String codeType;
	global String codeTypeID;
	global String diagnosisCodeSet;
	global String dischargeCode;
	global String dischargeCodeDescription;
	global String dischargeCodeType;
	global String dischargeCodeTypeId;
	global String dischargeDiagnosisCodeSet;
	global Datetime dischargeDiagnosisEffectiveDate;
	global Datetime dischargeDiagnosisEndDate;
	global Datetime effectiveDate;
	global Datetime endDate;
	global String healthConditionId;
	global String healthcareDiagnosisCode;
	global String id;
	global String modifiedCode;
	global String modifiedCodeDescription;
	global String modifiedCodeType;
	global String modifiedCodeTypeId;
	global String modifiedDiagnosisCodeSet;
	global Datetime modifiedEffectiveDate;
	global Datetime modifiedEndDate;
	global Boolean modifiedPrimaryDiagnosis;
	global String name;
	global String presentOnAdmission;
	global Boolean primary;
	global Boolean primaryDischargeDiagnosis;
	global String sourceSystem;
	global String sourceSystemIdentifier;
	global Datetime sourceSystemModified;
	global CareDiagnosisOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}