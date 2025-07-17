global class CdpCalculatedInsightOutput {
	global String apiName;
	global String calculatedInsightStatus;
	global String creationType;
	global String dataSpace;
	global String definitionStatus;
	global String definitionType;
	global String description;
	global List<ConnectApi.CdpCalculatedInsightDimension> dimensions;
	global String displayName;
	global String expression;
	global Boolean isEnabled;
	global String lastCalcInsightStatusDateTime;
	global String lastCalcInsightStatusErrorCode;
	global String lastRunDateTime;
	global String lastRunStatus;
	global String lastRunStatusDateTime;
	global String lastRunStatusErrorCode;
	global List<ConnectApi.CdpCalculatedInsightMeasure> measures;
	global String publishScheduleEndDate;
	global String publishScheduleInterval;
	global String publishScheduleStartDateTime;
	global CdpCalculatedInsightOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}