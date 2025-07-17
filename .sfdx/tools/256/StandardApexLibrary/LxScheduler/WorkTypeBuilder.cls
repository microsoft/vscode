global class WorkTypeBuilder {
	global WorkTypeBuilder() { }
	global lxscheduler.WorkType build() { }
	global Object clone() { }
	global lxscheduler.WorkTypeBuilder setBlockTimeAfterAppointmentInMinutes(Integer blockTimeAfterAppointmentInMinutes) { }
	global lxscheduler.WorkTypeBuilder setBlockTimeBeforeAppointmentInMinutes(Integer blockTimeBeforeAppointmentInMinutes) { }
	global lxscheduler.WorkTypeBuilder setDurationInMinutes(Integer durationInMinutes) { }
	global lxscheduler.WorkTypeBuilder setId(String id) { }
	global lxscheduler.WorkTypeBuilder setOperatingHoursId(String operatingHoursId) { }
	global lxscheduler.WorkTypeBuilder setSkillRequirements(List<lxscheduler.SkillRequirement> skillRequirements) { }
	global lxscheduler.WorkTypeBuilder setTimeFrameEndInMinutes(Integer timeFrameEndInMinutes) { }
	global lxscheduler.WorkTypeBuilder setTimeFrameStartInMinutes(Integer timeFrameStartInMinutes) { }

}