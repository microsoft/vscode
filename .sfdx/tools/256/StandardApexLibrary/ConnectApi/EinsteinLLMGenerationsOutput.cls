global class EinsteinLLMGenerationsOutput {
	global List<ConnectApi.EinsteinLLMGenerationItemOutput> generations;
	global ConnectApi.WrappedMapObject parameters;
	global String prompt;
	global String requestId;
	global EinsteinLLMGenerationsOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}