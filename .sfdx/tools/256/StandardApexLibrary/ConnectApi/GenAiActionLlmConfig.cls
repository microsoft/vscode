global class GenAiActionLlmConfig {
	global Map<String,ConnectApi.GenAiActionWrappedValue> additionalParameters;
	global String featureId;
	global Double frequencyPenalty;
	global Boolean hasGuardrail;
	global Integer maxTokens;
	global String model;
	global Double presencePenalty;
	global List<String> stopSequences;
	global Double temperature;
	global Boolean useAgentModel;
	global GenAiActionLlmConfig() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}