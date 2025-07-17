global class CdpIdentityResolutionConfigPatchInput {
	global String description;
	global Boolean doesRunAutomatically;
	global String label;
	global List<ConnectApi.CdpIdentityResolutionMatchRule> matchRules;
	global List<ConnectApi.CdpIdentityResolutionReconciliationRule> reconciliationRules;
	global CdpIdentityResolutionConfigPatchInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}