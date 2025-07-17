global class ReportFilter {
	global ReportFilter(String column, String operator, String value, reports.ReportFilterType filterType, String entityName) { }
	global ReportFilter(String column, String operator, String value, reports.ReportFilterType filterType) { }
	global ReportFilter(String column, String operator, String value) { }
	global ReportFilter() { }
	global Object clone() { }
	global String getColumn() { }
	global String getEntityName() { }
	global reports.ReportFilterType getFilterType() { }
	global String getOperator() { }
	global String getValue() { }
	global void setColumn(String column) { }
	global void setEntityName(String entityName) { }
	global void setFilterType(String value) { }
	global void setFilterType(reports.ReportFilterType filterType) { }
	global void setOperator(String operator) { }
	global void setValue(String value) { }
	global String toString() { }

}