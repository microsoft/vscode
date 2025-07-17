global class JsonValueOutput {
	global Boolean booleanValue;
	global Double doubleValue;
	global Integer integerValue;
	global String jsonArrayValue;
	global String jsonStringValue;
	global String stringValue;
	global JsonValueOutput(String stringValue, Boolean booleanValue, Integer integerValue, Double doubleValue, String jsonStringValue, String jsonArrayValue) { }
	global Object clone() { }

}