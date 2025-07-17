global class MaintenanceInfo {
	global String description;
	global String maintenanceTitle;
	global ConnectApi.MaintenanceType maintenanceType;
	global Datetime messageEffectiveTime;
	global Datetime messageExpirationTime;
	global Datetime scheduledEndDowntime;
	global Datetime scheduledEndMaintenanceTime;
	global Datetime scheduledStartDowntime;
	global Datetime scheduledStartMaintenanceTime;
	global MaintenanceInfo() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}