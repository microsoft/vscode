global class JSONGenerator {
	global Object clone() { }
	global void close() { }
	global String getAsString() { }
	global Boolean isClosed() { }
	global void writeBlob(Blob b) { }
	global void writeBlobField(String fieldName, Blob b) { }
	global void writeBoolean(Boolean b) { }
	global void writeBooleanField(String fieldName, Boolean b) { }
	global void writeDate(Date d) { }
	global void writeDateField(String fieldName, Date d) { }
	global void writeDateTime(Datetime dt) { }
	global void writeDateTimeField(String fieldName, Datetime dt) { }
	global void writeEndArray() { }
	global void writeEndObject() { }
	global void writeFieldName(String fieldName) { }
	global void writeId(Id id) { }
	global void writeIdField(String fieldName, Id id) { }
	global void writeNull() { }
	global void writeNullField(String fieldName) { }
	global void writeNumber(Decimal d) { }
	global void writeNumber(Double d) { }
	global void writeNumber(Integer i) { }
	global void writeNumber(Long lng) { }
	global void writeNumberField(String fieldName, Decimal d) { }
	global void writeNumberField(String fieldName, Double d) { }
	global void writeNumberField(String fieldName, Integer i) { }
	global void writeNumberField(String fieldName, Long lng) { }
	global void writeObject(Object o) { }
	global void writeObjectField(String fieldName, Object o) { }
	global void writeStartArray() { }
	global void writeStartObject() { }
	global void writeString(String str) { }
	global void writeStringField(String fieldName, String str) { }
	global void writeTime(Time t) { }
	global void writeTimeField(String fieldName, Time t) { }

}