global class SearchFilter {
	global String field;
	global ConnectApi.FilterOperator operator;
	global ConnectApi.AbstractList values;
	global SearchFilter() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}