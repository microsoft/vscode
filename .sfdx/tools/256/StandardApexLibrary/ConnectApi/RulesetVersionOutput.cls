global class RulesetVersionOutput {
	global Datetime endDate;
	global ConnectApi.RulesetExecutionTypeEnumRepresentation executionType;
	global String id;
	global String name;
	global String ruleLibraryApiName;
	global Integer ruleLibraryVersionNumber;
	global String rulesetApiName;
	global Datetime startDate;
	global ConnectApi.RulesetStatusEnumRepresentation status;
	global Integer versionNumber;
	global RulesetVersionOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}