global class Date {
	global static Integer daysInMonth(Integer year, Integer month) { }
	global static Boolean isLeapYear(Integer year) { }
	global static Date newInstance(Integer year, Integer month, Integer day) { }
	global static Date parse(String str) { }
	/**
	 * Return the current date
	 */
	global static Date today() { }
	global static Date valueOf(Object o) { }
	global static Date valueOf(String str) { }

}