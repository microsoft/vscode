global class CdpIdentityResolutionConfigInput {
	global ConnectApi.CdpIdentityResolutionConfigurationType configurationType;
	global String dataSpaceName;
	global String description;
	global Boolean doesRunAutomatically;
	global String label;
	global List<ConnectApi.CdpIdentityResolutionMatchRule> matchRules;
	global List<ConnectApi.CdpIdentityResolutionReconciliationRule> reconciliationRules;
	global String rulesetId;
	global String secondaryDmo;
	global CdpIdentityResolutionConfigInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}