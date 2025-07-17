global class GroupingInfo {
	global GroupingInfo(String name, reports.ColumnSortOrder sortOrder, reports.DateGranularity dateGranularity, String sortAggregate) { }
	global GroupingInfo() { }
	global Object clone() { }
	global reports.DateGranularity getDateGranularity() { }
	global String getName() { }
	global String getSortAggregate() { }
	global reports.ColumnSortOrder getSortOrder() { }
	global void setDateGranularity(String value) { }
	global void setDateGranularity(reports.DateGranularity dateGranularity) { }
	global void setName(String name) { }
	global void setSortAggregate(String sortAggregate) { }
	global void setSortOrder(String value) { }
	global void setSortOrder(reports.ColumnSortOrder sortOrder) { }
	global String toString() { }

}