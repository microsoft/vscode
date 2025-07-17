global class RescheduleSlotChainInput {
	global String careProgramEnrolleeId;
	global List<ConnectApi.Slots> newSlotsInputRepresentation;
	global String rescheduleReason;
	global String serviceAppointmentGroupIdRescheduledSlots;
	global List<String> serviceAppointmentIdsRescheduledSlots;
	global String status;
	global String workProcedureId;
	global RescheduleSlotChainInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}