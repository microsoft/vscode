global class CareRequestDrugOutput {
	global Integer approvedUnits;
	global String assertionIdentifier;
	global String authApprovalIdentifier;
	global String authorizationRefIdentifier;
	global List<ConnectApi.CareRequestReviewerOutput> careRequestReviewers;
	global String clinicalDetermination;
	global String clinicalDeterminationNote;
	global String clinicalDeterminationReason;
	global String code;
	global String codeType;
	global Integer daysSupply;
	global Datetime decisionDate;
	global Integer deniedUnits;
	global ConnectApi.DispenserAddressOutput dispenserAddress;
	global String dispenserFaxNumber;
	global String dispenserId;
	global String dispenserName;
	global String dispenserPhoneNumber;
	global String dispenserTaxId;
	global String dispensingPharmacy;
	global String dose;
	global String drugAdministrationSetting;
	global String drugCode;
	global String frequency;
	global String id;
	global String medicationCode;
	global String medicationRefObjectId;
	global String modifiedCode;
	global String modifiedCodeType;
	global Integer modifiedDaysSupply;
	global String modifiedDose;
	global String modifiedFrequency;
	global String modifiedName;
	global String modifiedSig;
	global String modifiedStrength;
	global Integer modifiedTherapyDuration;
	global Integer modifiedUnits;
	global String name;
	global Datetime prescriptionDate;
	global Datetime prescriptionFillDate;
	global Integer prescriptionFills;
	global String priority;
	global String requestType;
	global Datetime responseDateTime;
	global String serviceCategory;
	global String serviceCategoryCode;
	global String serviceInformationResponse;
	global ConnectApi.ServicingFacilityOutput servicingFacility;
	global ConnectApi.ServicingPractitionerOutput servicingProvider;
	global String sig;
	global String sourceSystem;
	global String sourceSystemIdentifier;
	global Datetime sourceSystemModified;
	global String status;
	global ConnectApi.CodeableConceptOutput statusCode;
	global String statusReason;
	global String strength;
	global Datetime submittedDateTime;
	global Integer therapyDuration;
	global Integer transactionNumber;
	global Integer units;
	global CareRequestDrugOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}