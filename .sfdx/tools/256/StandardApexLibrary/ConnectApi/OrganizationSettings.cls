global class OrganizationSettings {
	global Integer accessTimeout;
	global ConnectApi.Features features;
	global List<ConnectApi.MaintenanceInfo> maintenanceInfo;
	global String name;
	global String orgId;
	global ConnectApi.UserSettings userSettings;
	global OrganizationSettings() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}