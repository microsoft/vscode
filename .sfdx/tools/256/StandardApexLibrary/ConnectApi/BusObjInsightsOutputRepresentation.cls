global class BusObjInsightsOutputRepresentation {
	global String currencyIsoCode;
	global Double current;
	global List<ConnectApi.InsightsOutputRepresentation> insights;
	global String kpiDashboardUrl;
	global String kpiSummaryText;
	global Double last;
	global String period;
	global Datetime targetCompletionDate;
	global Double targetValue;
	global ConnectApi.ConnectInsightUnitEnum unit;
	global BusObjInsightsOutputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}