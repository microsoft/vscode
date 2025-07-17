global class ViewReference {
	global Object clone() { }
	global Boolean equals(Object o) { }
	global Object getParameter(String name) { }
	global static Slack.ViewReference getViewByName(String developerName) { }
	global String getViewName() { }
	global void setParameter(String name, Object value) { }

}