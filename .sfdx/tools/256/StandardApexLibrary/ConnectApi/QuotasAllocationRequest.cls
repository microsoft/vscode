global class QuotasAllocationRequest {
	global String contextId;
	global Datetime endDate;
	global Map<String,Integer> leadTimeMap;
	global String siteId;
	global Datetime startDate;
	global String workProcedureId;
	global String workTypeId;
	global QuotasAllocationRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}