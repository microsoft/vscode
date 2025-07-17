global class ReportTypeMetadata {
	global Object clone() { }
	global List<reports.ReportTypeColumnCategory> getCategories() { }
	global reports.ReportDivisionInfo getDivisionInfo() { }
	global reports.ReportScopeInfo getScopeInfo() { }
	global List<reports.StandardDateFilterDurationGroup> getStandardDateFilterDurationGroups() { }
	global Map<String,reports.StandardFilterInfo> getStandardFilterInfos() { }
	global String toString() { }

}