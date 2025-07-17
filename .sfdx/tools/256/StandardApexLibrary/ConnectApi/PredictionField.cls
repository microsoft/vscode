global class PredictionField {
	global String definitionState;
	global String entity;
	global String field;
	global List<ConnectApi.FieldClassificationSetting> fieldClassificationSettings;
	global String globalFilters;
	global List<String> includedFields;
	global Boolean isActive;
	global Boolean isEnabled;
	global String modelDefinitionId;
	global String modelId;
	global String predictionDefinitionId;
	global String predictionFieldId;
	global String primaryDataDefinitionId;
	global String trainingFilters;
	global PredictionField() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}