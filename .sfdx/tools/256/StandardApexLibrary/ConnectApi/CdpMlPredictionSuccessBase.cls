global class CdpMlPredictionSuccessBase {
	global List<ConnectApi.CdpMlPredictionContribution> factors;
	global ConnectApi.CdpAssetReference partition;
	global List<ConnectApi.CdpMlPredictionContribution> prescriptions;
	global ConnectApi.CdpMlModelPredictionTypeEnum type;
	global ConnectApi.CdpMlPredictionWarnings warnings;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}