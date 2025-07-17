global class LearningEvaluationResult {
	global LearningEvaluationResult() { }
	global Object clone() { }
	global Double getLearningItemProgress() { }
	global sfdc_enablement.LearningItemProgressStatus getLearningItemProgressStatus() { }
	global void setLearningItemProgress(Double learningItemProgress) { }
	global void setLearningItemProgressStatus(sfdc_enablement.LearningItemProgressStatus learningItemProgressStatus) { }

}