global class AppointmentSlotStatusResult {
	global ConnectApi.ErrorRepresentation error;
	global String externalSlotId;
	global Boolean isSuccess;
	global ConnectApi.SlotStatus slotStatus;
	global List<ConnectApi.AppointmentSlotStatus> slotStatuses;
	global AppointmentSlotStatusResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}