global class CdpIdentityResolutionReconciliationRuleOutput {
	global String entityName;
	global List<ConnectApi.CdpIdentityResolutionReconciliationFieldRuleOutput> fields;
	global String linkDmoName;
	global ConnectApi.CdpIdentityResolutionReconciliationRuleType ruleType;
	global Boolean shouldIgnoreEmptyValue;
	global List<ConnectApi.CdpIdentityResolutionReconciliationSourceOutput> sources;
	global String unifiedDmoName;
	global CdpIdentityResolutionReconciliationRuleOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}