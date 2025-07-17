global class DecisionTableCondition {
	global String fieldName;
	global ConnectApi.DecisionTableOperator operator;
	global String sourceObject;
	global Object value;
	global DecisionTableCondition() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}