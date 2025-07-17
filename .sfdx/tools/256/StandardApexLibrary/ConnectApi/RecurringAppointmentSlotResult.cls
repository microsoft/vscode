global class RecurringAppointmentSlotResult {
	global List<String> appointmentDates;
	global ConnectApi.ErrorRepresentation error;
	global String operatingHoursId;
	global Integer recurringDatesOffset;
	global String serviceResourceId;
	global String serviceTerritoryId;
	global List<ConnectApi.RecurringSlotsResult> slotsByDate;
	global RecurringAppointmentSlotResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}