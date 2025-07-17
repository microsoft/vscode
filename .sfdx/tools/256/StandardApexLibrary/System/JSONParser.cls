global class JSONParser {
	global void clearCurrentToken() { }
	global Object clone() { }
	global Blob getBlobValue() { }
	global Boolean getBooleanValue() { }
	global String getCurrentName() { }
	global System.JSONToken getCurrentToken() { }
	global Datetime getDateTimeValue() { }
	global Date getDateValue() { }
	global Decimal getDecimalValue() { }
	global Double getDoubleValue() { }
	global Id getIdValue() { }
	global Integer getIntegerValue() { }
	global System.JSONToken getLastClearedToken() { }
	global Long getLongValue() { }
	global String getText() { }
	global Time getTimeValue() { }
	global Boolean hasCurrentToken() { }
	global System.JSONToken nextToken() { }
	global System.JSONToken nextValue() { }
	global Object readValueAs(System.Type apexType) { }
	global Object readValueAsStrict(System.Type apexType) { }
	global void skipChildren() { }

}