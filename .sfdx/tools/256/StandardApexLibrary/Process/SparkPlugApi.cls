global class SparkPlugApi {
	global SparkPlugApi() { }
	global Object clone() { }
	global static Process.SparkPlugApi.SparkPlugDescribeResult describePlugin(String className) { }
	global static List<Process.SparkPlugApi.SparkPlugDescribeResult> describePlugins() { }
	global static String invokePluginWithJson(String className, String parameters) { }
global class SparkPlugDescribeResult {
	global List<Process.SparkPlugApi.SparkPlugParameter> inputParameters;
	global String name;
	global List<Process.SparkPlugApi.SparkPlugParameter> outputParameters;
	global SparkPlugApi.SparkPlugDescribeResult() { }
	global Object clone() { }

}
global class SparkPlugParameter {
	global String name;
	global String parameterType;
	global Boolean required;
	global SparkPlugApi.SparkPlugParameter() { }
	global Object clone() { }

}

}