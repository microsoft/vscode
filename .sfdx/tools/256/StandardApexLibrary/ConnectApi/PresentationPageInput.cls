global class PresentationPageInput {
	global Datetime activationDate;
	global String contentDocumentId;
	global List<ConnectApi.CustomFieldRepresentation> customFields;
	global Datetime deactivationDate;
	global String id;
	global Boolean isAdditionalContent;
	global Boolean mandatory;
	global String name;
	global Integer pageNumber;
	global List<ConnectApi.ProductGuidanceRepresentation> products;
	global PresentationPageInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}