global class TimeSlotOption {
	global Integer duration;
	global Integer durationValue;
	global Datetime endTimeValue;
	global Datetime startTime;
	global Datetime startTimeValue;
	global TimeSlotOption(Datetime startTime, Datetime endTime) { }
	global TimeSlotOption(Datetime startTime, Integer duration) { }
	global TimeSlotOption() { }
	global Object clone() { }

}