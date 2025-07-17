global class ServiceAppointmentRequestInfo {
	global ServiceAppointmentRequestInfo(Datetime startDate, Datetime endDate, List<lxscheduler.ServiceResourceInfo> ServiceResources, String SchedulingPolicyId, String workTypeGroupId, String accountId, String primaryResourceId, String workTypeId, String correlationId) { }
	global Object clone() { }
	global String getAccountId() { }
	global String getCorrelationId() { }
	global Datetime getEndDate() { }
	global String getPrimaryResourceId() { }
	global String getSchedulingPolicyId() { }
	global List<lxscheduler.ServiceResourceInfo> getServiceResources() { }
	global Datetime getStartDate() { }
	global String getWorkTypeGroupId() { }
	global String getWorkTypeId() { }

}