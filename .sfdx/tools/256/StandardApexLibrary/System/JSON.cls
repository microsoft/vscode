global class JSON {
	global JSON() { }
	global Object clone() { }
	global static System.JSONGenerator createGenerator(Boolean pretty) { }
	global static System.JSONParser createParser(String jsonString) { }
	global static Object deserialize(String jsonString, System.Type apexType) { }
	global static Object deserializeStrict(String jsonString, System.Type apexType) { }
	global static Object deserializeUntyped(String jsonString) { }
	global static String serialize(Object o, Boolean suppressApexObjectNulls) { }
	global static String serialize(Object o) { }
	global static String serializePretty(Object o, Boolean suppressApexObjectNulls) { }
	global static String serializePretty(Object o) { }

}