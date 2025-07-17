global class ClaimItemInputRep {
	global String action;
	global List<ConnectApi.AdditionalFieldInputRep> additionalFields;
	global List<ConnectApi.ClaimAttributeInputRep> attributes;
	global String category;
	global String instanceKey;
	global String insurancePolicyCoverageId;
	global String insuredItemId;
	global String name;
	global String participantInstanceKey;
	global String productCode;
	global ConnectApi.ClaimItemRelatedObjectInputRep relatedObject;
	global ClaimItemInputRep() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}