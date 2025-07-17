global class EinsteinPromptTemplateGenerationsRepresentation {
	global ConnectApi.EinsteinLlmGenerationCitationOutput citations;
	global List<ConnectApi.EinsteinPromptTemplateAttachment> fileData;
	global List<ConnectApi.EinsteinPromptTemplateGenerationsError> generationErrors;
	global List<ConnectApi.EinsteinLLMGenerationItemOutput> generations;
	global Boolean isSummarized;
	global ConnectApi.WrappedMapObject parameters;
	global String prompt;
	global String promptTemplateDevName;
	global String requestId;
	global List<ConnectApi.EinsteinPromptTemplateMaskContentRepresentation> requestMessages;
	global List<ConnectApi.EinsteinPromptTemplateMaskContentRepresentation> responseMessages;
	global List<ConnectApi.EinsteinPromptTemplateMaskDataRepresentation> slotsMaskingInformation;
	global EinsteinPromptTemplateGenerationsRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}