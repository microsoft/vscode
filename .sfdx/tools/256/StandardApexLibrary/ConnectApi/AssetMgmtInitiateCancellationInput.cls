global class AssetMgmtInitiateCancellationInput {
	global List<String> assetIds;
	global Datetime cancellationDate;
	global ConnectApi.AssetMgmtCancellationType cancellationOutputType;
	global ConnectApi.AssetMgmtReturnPolicyType returnPolicyType;
	global AssetMgmtInitiateCancellationInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}