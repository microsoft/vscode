global class ProgramApplicationInputRepresentation {
	global String accountId;
	global String appName;
	global List<ConnectApi.ProgramApplicationItemInputRepresentation> applicationItems;
	global ConnectApi.AttributeCreationStrategyEnum attributeCreationStrategy;
	global String description;
	global List<ConnectApi.ProgramApplicationFileInputRepresentation> files;
	global Boolean isSubmittedByThirdParty;
	global String locationId;
	global String programId;
	global String submittedByAccountId;
	global ProgramApplicationInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}