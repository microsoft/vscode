global class SchedulerResources {
	global SchedulerResources() { }
	global Object clone() { }
	global static String getAppointmentCandidates(lxscheduler.GetAppointmentCandidatesInput getAppointmentCandidatesInput) { }
	global static String getAppointmentSlots(lxscheduler.GetAppointmentSlotsInput getAppointmentSlotsInput) { }
	global static void setAppointmentCandidatesMock(String expectedResponse) { }
	global static void setAppointmentSlotsMock(String expectedResponse) { }

}