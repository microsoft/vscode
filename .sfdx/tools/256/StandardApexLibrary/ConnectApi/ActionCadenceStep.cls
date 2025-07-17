global class ActionCadenceStep {
	global String id;
	global String parentStepName;
	global List<ConnectApi.ActionCadenceRule> rules;
	global Map<String,ConnectApi.MapValueWrapper> stepAttributes;
	global String stepName;
	global String stepTitle;
	global String type;
	global List<ConnectApi.ActionCadenceStepVariant> variants;
	global ActionCadenceStep() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}