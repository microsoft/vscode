global interface ServiceResourceScheduleHandler {
	List<lxscheduler.ServiceResourceSchedule> getUnavailableTimeslots(lxscheduler.ServiceAppointmentRequestInfo param0);

}