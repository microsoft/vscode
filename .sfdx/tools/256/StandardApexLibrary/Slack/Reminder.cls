global class Reminder {
	global Reminder() { }
	global Object clone() { }
	global String getChannel() { }
	global Integer getCompleteTs() { }
	global String getCreator() { }
	global String getId() { }
	global Object getItem() { }
	global Slack.Reminder.Recurrence getRecurrence() { }
	global String getText() { }
	global Integer getTime() { }
	global String getUser() { }
	global Boolean isRecurring() { }
	global void setChannel(String channel) { }
	global void setCompleteTs(Integer completeTs) { }
	global void setCreator(String creator) { }
	global void setId(String id) { }
	global void setItem(Object item) { }
	global void setRecurrence(Slack.Reminder.Recurrence recurrence) { }
	global void setRecurring(Boolean recurring) { }
	global void setText(String text) { }
	global void setTime(Integer timeValue) { }
	global void setUser(String user) { }
	global String toString() { }
global class Recurrence {
	global Reminder.Recurrence() { }
	global Object clone() { }
	global String getFrequency() { }
	global List<String> getWeekdays() { }
	global void setFrequency(String frequency) { }
	global void setWeekdays(List<String> weekdays) { }

}

}