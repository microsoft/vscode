global class CareRequestItemOutput {
	global Integer approvedLengthOfStay;
	global String approvedLevelOfCare;
	global Integer approvedQuantity;
	global Datetime approvedServiceEndDate;
	global Datetime approvedServiceStartDate;
	global String assertionIdentifier;
	global String authApprovalIdentifier;
	global String authorizationRefIdentifier;
	global List<ConnectApi.CareRequestReviewerOutput> careRequestReviewers;
	global String clinicalDetermination;
	global String clinicalDeterminationNotes;
	global String clinicalDeterminationReason;
	global String clinicalServiceRequestId;
	global String codeDescription;
	global String codeType;
	global String codeTypeId;
	global Integer cumulativeLengthOfStay;
	global String currentLevelOfCare;
	global Datetime decisionDate;
	global String deniedLevelOfCare;
	global Integer deniedQuantity;
	global Datetime effectiveDate;
	global Datetime endDate;
	global String freeFormProcedureDescription;
	global String healthcareProcedureCode;
	global String id;
	global Datetime modifiedCareEndDate;
	global String modifiedCode;
	global String modifiedCodeDescription;
	global String modifiedCodeType;
	global String modifiedCodeTypeId;
	global Datetime modifiedEffectiveDate;
	global String modifiedLevelOfCare;
	global String modifiedModifier;
	global String modifiedModifierDescription;
	global String modifiedProcedureCodeSet;
	global Integer modifiedQuantity;
	global String modifier1;
	global String modifier1Description;
	global String modifier2;
	global String modifier2Description;
	global String modifier3;
	global String modifier3Description;
	global String modifier4;
	global String modifier4Description;
	global String modifierCodeSet;
	global String name;
	global String priority;
	global String procedureCodeSet;
	global Integer quantity;
	global String quantityType;
	global String reasonCode;
	global String requestType;
	global Integer requestedLengthOfStay;
	global String requestedLevelOfCare;
	global Datetime requestedServiceEndDate;
	global Datetime requestedServiceStartDate;
	global Datetime responseDateTime;
	global String serviceCategory;
	global String serviceCategoryCode;
	global String serviceInformationResponse;
	global ConnectApi.ServicingFacilityOutput servicingFacility;
	global ConnectApi.ServicingPractitionerOutput servicingProvider;
	global String sourceSystem;
	global String sourceSystemIdentifier;
	global Datetime sourceSystemModified;
	global String status;
	global ConnectApi.CodeableConceptOutput statusCode;
	global String statusReason;
	global Datetime submittedDateTime;
	global Integer transactionNumber;
	global CareRequestItemOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}