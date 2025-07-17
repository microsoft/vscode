global class MemberCurrencyOutput {
	global Map<String,Object> additionalLoyaltyMemberCurrencyFields;
	global Double escrowPointsBalance;
	global Double expirablePoints;
	global Datetime lastAccrualProcessedDate;
	global Datetime lastEscrowProcessedDate;
	global Datetime lastExpirationProcessRunDate;
	global Datetime lastPointsAggregationDate;
	global Datetime lastPointsResetDate;
	global String loyaltyMemberCurrencyName;
	global String loyaltyProgramCurrencyId;
	global String loyaltyProgramCurrencyName;
	global String memberCurrencyId;
	global Datetime nextQualifyingPointsResetDate;
	global Double pointsBalance;
	global Double qualifyingPointsBalanceBeforeReset;
	global Double totalEscrowPointsAccrued;
	global Double totalEscrowRolloverPoints;
	global Double totalPointsAccrued;
	global Double totalPointsExpired;
	global Double totalPointsRedeemed;
	global MemberCurrencyOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}