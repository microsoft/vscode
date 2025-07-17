global class EinsteinLlmAdditionalConfigInput {
	global Map<String,ConnectApi.WrappedValue> additionalParameters;
	global String applicationName;
	global Boolean enablePiiMasking;
	global Double frequencyPenalty;
	global Integer maxTokens;
	global String model;
	global Integer numGenerations;
	global Double presencePenalty;
	global List<String> stopSequences;
	global Double temperature;
	global EinsteinLlmAdditionalConfigInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}