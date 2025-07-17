global class ObjectFilter {
	global Map<String,ConnectApi.ObjectFilters> childObjectFilters;
	global List<ConnectApi.FieldFilter> fieldFilters;
	global ObjectFilter() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}