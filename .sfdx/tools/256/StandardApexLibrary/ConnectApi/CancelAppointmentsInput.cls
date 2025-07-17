global class CancelAppointmentsInput {
	global String appointmentType;
	global String externalAppointmentId;
	global String externalPatientId;
	global String healthcarePractitionerFacilityId;
	global String healthcareResourceId;
	global String patientId;
	global List<ConnectApi.IAMAppointmentResource> resourceList;
	global String resourceType;
	global String serviceAppointmentId;
	global String serviceType;
	global ConnectApi.GetSlotStatusInput slot;
	global String status;
	global CancelAppointmentsInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}