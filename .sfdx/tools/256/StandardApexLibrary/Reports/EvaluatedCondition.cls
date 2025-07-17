global class EvaluatedCondition {
	global EvaluatedCondition(String aggregateName, String aggregateLabel, Double compareTo, Double value, String displayCompareTo, String displayValue, reports.EvaluatedConditionOperator operator) { }
	global Object clone() { }
	global String getAggregateLabel() { }
	global String getAggregateName() { }
	global Double getCompareTo() { }
	global String getDisplayCompareTo() { }
	global String getDisplayValue() { }
	global reports.EvaluatedConditionOperator getOperator() { }
	global Double getValue() { }

}