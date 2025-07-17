global class ReportExtendedMetadata {
	global Object clone() { }
	global Map<String,reports.AggregateColumn> getAggregateColumnInfo() { }
	global Map<String,reports.DetailColumn> getDetailColumnInfo() { }
	global Map<String,reports.GroupingColumn> getGroupingColumnInfo() { }
	global String toString() { }

}