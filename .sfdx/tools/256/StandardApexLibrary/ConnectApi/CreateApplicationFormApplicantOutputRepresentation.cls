global class CreateApplicationFormApplicantOutputRepresentation {
	global String applicantId;
	global List<String> partyExpense;
	global List<ConnectApi.CreateAppFormPartyFinancialAssetOutputRep> partyFinancialAsset;
	global List<ConnectApi.CreateAppFormPartyFinancialLiabilityOutputRep> partyFinancialLiability;
	global List<ConnectApi.CreateAppFormPartyIdentityVerificationOutputRep> partyIdentityVerification;
	global List<String> partyIncome;
	global List<String> partyProfileAddress;
	global String partyProfileId;
	global List<String> partyProfileRisk;
	global List<String> personEmployment;
	global CreateApplicationFormApplicantOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}