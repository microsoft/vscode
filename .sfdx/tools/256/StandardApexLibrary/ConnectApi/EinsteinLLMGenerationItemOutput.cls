global class EinsteinLLMGenerationItemOutput {
	global ConnectApi.EinsteinLlmGenerationContentQualityOutput contentQualityRepresentation;
	global String parameters;
	global String responseId;
	global ConnectApi.EinsteinLlmGenerationSafetyScoreOutput safetyScoreRepresentation;
	global String text;
	global EinsteinLLMGenerationItemOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}