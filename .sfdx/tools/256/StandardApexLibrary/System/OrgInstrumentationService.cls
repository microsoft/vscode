global class OrgInstrumentationService {
	global OrgInstrumentationService(System.OrgMetricServiceEnum service, String subServiceName, String featureGroupName, String featureName) { }
	global Object clone() { }
	global System.OrgInstrumentationOperation getInstrumentationOperation(String operationName, Map<String,String> tags, List<Double> percentileBuckets) { }
	global System.OrgInstrumentationOperation getInstrumentationOperation(String operationName, Map<String,String> tags, List<Long> buckets) { }
	global System.OrgInstrumentationOperation getInstrumentationOperation(String operationName, Map<String,String> tags) { }
	global Map<String,String> getTracerContext() { }
	global void propagateContext(System.HttpRequest request) { }

}