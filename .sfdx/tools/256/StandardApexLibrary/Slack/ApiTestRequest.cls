global class ApiTestRequest {
	global static Slack.ApiTestRequest.Builder builder() { }
	global Object clone() { }
	global String getError() { }
	global String getFoo() { }
	global String toString() { }
global class Builder {
	global ApiTestRequest.Builder() { }
	global Slack.ApiTestRequest build() { }
	global Object clone() { }
	global Slack.ApiTestRequest.Builder error(String error) { }
	global Slack.ApiTestRequest.Builder foo(String foo) { }

}

}