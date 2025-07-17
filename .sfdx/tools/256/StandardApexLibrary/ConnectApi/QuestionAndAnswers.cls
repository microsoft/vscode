global class QuestionAndAnswers {
	global Object clone() { }
	global static ConnectApi.QuestionAndAnswersSuggestions getSuggestions(String communityId, String q, String subjectId, Boolean includeArticles, Integer maxResults) { }
	global static void setTestGetSuggestions(String communityId, String q, String subjectId, Boolean includeArticles, Integer maxResults, ConnectApi.QuestionAndAnswersSuggestions result) { }
	global static ConnectApi.QuestionAndAnswersCapability updateQuestionAndAnswers(String communityId, String feedElementId, ConnectApi.QuestionAndAnswersCapabilityInput questionAndAnswersCapability) { }

}