global class IAMAppointmentResource {
	global ConnectApi.HCAddressInput facilityAddress;
	global String facilityId;
	global String healthcarePractitionerFacilityId;
	global String healthcareResourceId;
	global Boolean isRequired;
	global Boolean notAvailableToSchedule;
	global String resourceType;
	global ConnectApi.GetSlotStatusInput slot;
	global IAMAppointmentResource() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}