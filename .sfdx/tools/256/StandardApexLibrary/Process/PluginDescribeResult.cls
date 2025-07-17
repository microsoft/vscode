global class PluginDescribeResult {
	global String description;
	global List<Process.PluginDescribeResult.InputParameter> inputParameters;
	global String name;
	global List<Process.PluginDescribeResult.OutputParameter> outputParameters;
	global String tag;
	global PluginDescribeResult() { }
	global Object clone() { }
global class InputParameter {
	global String description;
	global String name;
	global Process.PluginDescribeResult.ParameterType parameterType;
	global Boolean required;
	global PluginDescribeResult.InputParameter(String name, String description, Process.PluginDescribeResult.ParameterType parameterType, Boolean required) { }
	global PluginDescribeResult.InputParameter(String name, Process.PluginDescribeResult.ParameterType parameterType, Boolean required) { }
	global Object clone() { }

}
global class OutputParameter {
	global String description;
	global String name;
	global Process.PluginDescribeResult.ParameterType parameterType;
	global PluginDescribeResult.OutputParameter(String name, String description, Process.PluginDescribeResult.ParameterType parameterType) { }
	global PluginDescribeResult.OutputParameter(String name, Process.PluginDescribeResult.ParameterType parameterType) { }
	global Object clone() { }

}
global enum ParameterType {
BOOLEAN,
DATE,
DATETIME,
DECIMAL,
DOUBLE,
FLOAT,
ID,
INTEGER,
LONG,
STRING,
TIME
}

}