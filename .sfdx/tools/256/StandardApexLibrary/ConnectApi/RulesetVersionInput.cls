global class RulesetVersionInput {
	global Datetime endDate;
	global ConnectApi.RulesetExecutionTypeEnumRepresentation executionType;
	global String name;
	global String ruleLibraryApiName;
	global Integer ruleLibraryVersionNumber;
	global String rulesetApiName;
	global Datetime startDate;
	global ConnectApi.RulesetStatusEnumRepresentation status;
	global Integer versionNumber;
	global RulesetVersionInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}