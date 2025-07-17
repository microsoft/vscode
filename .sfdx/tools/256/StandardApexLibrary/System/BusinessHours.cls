global class BusinessHours {
	global BusinessHours() { }
	global static Datetime add(Id businessHoursId, Datetime startDate, Long interval) { }
	global static Datetime addGmt(Id businessHoursId, Datetime startDate, Long interval) { }
	global Object clone() { }
	global static Long diff(String businessHoursId, Datetime startDate, Datetime endDate) { }
	global static Boolean isWithin(String businessHoursId, Datetime targetDate) { }
	global static Datetime nextStartDate(Id businessHoursId, Datetime targetDate) { }

}