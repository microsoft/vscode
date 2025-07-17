global class OrgInstrumentationOperation {
	global Object clone() { }
	global System.TracerSpan createNewSpan() { }
	global void end(System.OrgInstrumentationContext context) { }
	global void endWithStatus(System.OrgInstrumentationContext context, Integer statusCode) { }
	global void publishCustomHistogramValues(String metricName, Long value) { }
	global void publishCustomIncrementalValue(String metricName, Long value) { }
	global void publishCustomPercentileSet(String metricName, Long value) { }
	global void publishIncrementalValue(System.OrgMetricTypeEnum metricType, Long value, Integer statusCode) { }
	global void publishPercentileSet(System.OrgMetricTypeEnum metricType, Long value) { }
	global void publishRequestCountAndDuration(Long countValue, Integer statusCode, Long duration, String metricName) { }
	global void publishRequestCountAndDuration(Long countValue, Integer statusCode, Long duration) { }
	global void setMetricTags(Map<String,String> tags) { }
	global System.OrgInstrumentationContext start(System.OrgMetricPublishTypeEnum publishingType) { }

}