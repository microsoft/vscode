global class ServiceResourceSchedule {
	global String serviceResourceId;
	global Set<lxscheduler.UnavailableTimeslot> unavailableTimeslots;
	global ServiceResourceSchedule(String serviceResourceId, Set<lxscheduler.UnavailableTimeslot> unavailableTimeslots) { }
	global Object clone() { }

}