global class RecurringTiming {
	global Date endDate;
	global Date endDateValue;
	global Integer intervalCount;
	global Integer intervalCountValue;
	global String intervalUnit;
	global RichMessaging.TimingIntervalUnit intervalUnitValue;
	global Date startDate;
	global Date startDateValue;
	global String timingType;
	global RecurringTiming(Date startDate, Date endDate, Integer intervalCount, RichMessaging.TimingIntervalUnit intervalUnit) { }
	global RecurringTiming() { }
	global Object clone() { }

}