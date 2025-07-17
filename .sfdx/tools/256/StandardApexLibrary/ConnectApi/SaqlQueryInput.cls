global class SaqlQueryInput {
	global ConnectApi.AnalyticsLicenseAttributes licenseAttributes;
	global ConnectApi.SaqlQueryMetadata metadata;
	global String name;
	global String query;
	global ConnectApi.QueryLanguage queryLanguage;
	global String timezone;
	global SaqlQueryInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}