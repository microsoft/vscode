global class EinsteinPromptTemplateGenerationsInput {
	global ConnectApi.EinsteinLlmAdditionalConfigInput additionalConfig;
	global String citationMode;
	global Map<String,ConnectApi.WrappedValue> inputParams;
	global Boolean isPreview;
	global String outputLanguage;
	global String provider;
	global Map<String,ConnectApi.WrappedValue> tags;
	global EinsteinPromptTemplateGenerationsInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}