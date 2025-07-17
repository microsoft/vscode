global class StarsListRequest {
	global static Slack.StarsListRequest.Builder builder() { }
	global Object clone() { }
	global Integer getCount() { }
	global String getCursor() { }
	global Integer getLimit() { }
	global Integer getPage() { }
	global String getTeamId() { }
	global String toString() { }
global class Builder {
	global StarsListRequest.Builder() { }
	global Slack.StarsListRequest build() { }
	global Object clone() { }
	global Slack.StarsListRequest.Builder count(Integer count) { }
	global Slack.StarsListRequest.Builder cursor(String cursor) { }
	global Slack.StarsListRequest.Builder limitValue(Integer limitValue) { }
	global Slack.StarsListRequest.Builder page(Integer page) { }
	global Slack.StarsListRequest.Builder teamId(String teamId) { }

}

}