global class ServiceAppointmentInput {
	global String additionalInformation;
	global ConnectApi.SvcApptModeEnum appointmentMode;
	global String appointmentType;
	global Integer attendeeLimit;
	global String city;
	global String comments;
	global String contactId;
	global String country;
	global String description;
	global String engagementChannelTypeId;
	global List<ConnectApi.ExtendedFieldInput> extendedFields;
	global ConnectApi.GroupAppointmentAccessTypeEnum groupAppointmentAccessType;
	global String parentRecordId;
	global String postalCode;
	global Datetime schedEndTime;
	global Datetime schedStartTime;
	global String serviceTerritoryId;
	global String state;
	global String street;
	global String subject;
	global String workTypeId;
	global ServiceAppointmentInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}