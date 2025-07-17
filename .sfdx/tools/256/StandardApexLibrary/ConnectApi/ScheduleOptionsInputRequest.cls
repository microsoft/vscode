global class ScheduleOptionsInputRequest {
	global String endDate;
	global ConnectApi.FrequencyCadenceEnum frequencyCadence;
	global ConnectApi.FrequencyCadenceOptions frequencyCadenceOptions;
	global String preferredTime;
	global String recursEveryMonthOnDay;
	global String schedulerName;
	global String startDate;
	global ConnectApi.BatchSchedulerStatusEnum status;
	global String timezone;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}