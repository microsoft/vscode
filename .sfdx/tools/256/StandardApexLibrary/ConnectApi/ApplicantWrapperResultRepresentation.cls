global class ApplicantWrapperResultRepresentation {
	global ConnectApi.ApplicantResultRepresentation applicant;
	global List<ConnectApi.PartyCreditProfileResultRepresentation> partyCreditProfile;
	global List<ConnectApi.PartyExpenseResultRepresentation> partyExpense;
	global List<ConnectApi.PartyFinancialAssetResultRepresentation> partyFinancialAsset;
	global List<ConnectApi.PartyFinancialLiabilityResultRepresentation> partyFinancialLiability;
	global List<ConnectApi.PartyIncomeResultRepresentation> partyIncome;
	global ConnectApi.PartyProfileResultRepresentation partyProfile;
	global List<ConnectApi.PersonEmploymentResultRepresentation> personEmployment;
	global ApplicantWrapperResultRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}