global class QuestionAndAnswersCapability {
	global ConnectApi.Comment bestAnswer;
	global ConnectApi.UserSummary bestAnswerSelectedBy;
	global Boolean canCurrentUserSelectOrRemoveBestAnswer;
	global ConnectApi.CandidateAnswersStatus candidateAnswers;
	global ConnectApi.Reference escalatedCase;
	global String questionTitle;
	global QuestionAndAnswersCapability() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}