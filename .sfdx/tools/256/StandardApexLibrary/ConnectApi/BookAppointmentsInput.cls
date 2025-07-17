global class BookAppointmentsInput {
	global String appointmentId;
	global String appointmentStatus;
	global String appointmentType;
	global String channelId;
	global String externalPatientId;
	global ConnectApi.HCAddressInput facilityAddress;
	global Boolean hasAppointmentTimeChanged;
	global String healthcarePractitionerFacilityId;
	global String healthcareResourceId;
	global Boolean notAvailableToSchedule;
	global String note;
	global String parentId;
	global String patientId;
	global List<ConnectApi.IAMAppointmentResource> resourceList;
	global String resourceType;
	global String serviceType;
	global ConnectApi.GetSlotStatusInput slot;
	global String timezone;
	global BookAppointmentsInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}