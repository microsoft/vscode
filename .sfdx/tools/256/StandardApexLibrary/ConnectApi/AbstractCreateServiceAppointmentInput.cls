global class AbstractCreateServiceAppointmentInput {
	global List<ConnectApi.AssignedResourcesInput> assignedResources;
	global ConnectApi.LeadInput lead;
	global String schedulingPolicyId;
	global ConnectApi.ServiceAppointmentInput serviceAppointment;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}