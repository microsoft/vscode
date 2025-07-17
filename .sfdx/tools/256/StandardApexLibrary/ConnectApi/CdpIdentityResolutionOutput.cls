global class CdpIdentityResolutionOutput {
	global Long anonymousUnifiedProfiles;
	global ConnectApi.CdpIdentityResolutionConfigurationType configurationType;
	global Double consolidationRate;
	global String dataSpaceName;
	global String description;
	global Boolean doesRunAutomatically;
	global String id;
	global Long knownUnifiedProfiles;
	global String label;
	global Datetime lastJobCompleted;
	global String lastJobStatus;
	global List<ConnectApi.CdpIdentityResolutionMatchRuleOutput> matchRules;
	global Long matchedSourceProfiles;
	global String objectApiName;
	global List<ConnectApi.CdpIdentityResolutionReconciliationRuleOutput> reconciliationRules;
	global String rulesetId;
	global String rulesetStatus;
	global String secondaryDmo;
	global Long sourceProfiles;
	global Long totalUnifiedProfiles;
	global CdpIdentityResolutionOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}