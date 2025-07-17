global class OptionDataResponse {
	global OptionDataResponse(List<Slack.Option> options) { }
	global OptionDataResponse(List<Slack.OptionGroup> optionGroups) { }
	global Object clone() { }
	global List<Slack.OptionGroup> getOptionGroups() { }
	global List<Slack.Option> getOptions() { }

}