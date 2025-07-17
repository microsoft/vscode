global class FindAppointmentSlotResult {
	global List<ConnectApi.ErrorRepresentation> errors;
	global Boolean isSuccess;
	global Map<String,List<ConnectApi.AppointmentSlotResult>> slots;
	global String slotsSerialized;
	global FindAppointmentSlotResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}