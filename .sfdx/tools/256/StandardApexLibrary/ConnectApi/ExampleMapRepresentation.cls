global class ExampleMapRepresentation {
	global Map<String,SObject> customMap;
	global Map<String,Object> objectMap;
	global Map<String,List<ConnectApi.ExampleEntityRepresentation>> repMapListOne;
	global Map<String,ConnectApi.ExampleEntityRepresentation> repMapOne;
	global Map<String,Map<String,Map<String,ConnectApi.ExampleEntityRepresentation>>> repMapThree;
	global Map<String,Map<String,ConnectApi.ExampleEntityRepresentation>> repMapTwo;
	global Map<String,String> stringMap;
	global ExampleMapRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}