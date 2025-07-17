global class PluginResult {
	global Map<String,Object> outputParameters;
	global PluginResult(String outputKey, Object outputValue) { }
	global PluginResult(Map<String,Object> outputParameters) { }
	global Object clone() { }

}