global class ReportManager {
	global ReportManager() { }
	global Object clone() { }
	global static reports.ReportDescribeResult describeReport(Id reportId) { }
	global static Map<String,List<reports.FilterOperator>> getDatatypeFilterOperatorMap() { }
	global static reports.ReportInstance getReportInstance(Id instanceId) { }
	global static List<reports.ReportInstance> getReportInstances(Id reportId) { }
	global static reports.ReportInstance runAsyncReport(Id reportId, reports.ReportMetadata rmData, Boolean includeDetails) { }
	global static reports.ReportInstance runAsyncReport(Id reportId, Boolean includeDetails) { }
	global static reports.ReportInstance runAsyncReport(Id reportId, reports.ReportMetadata rmData) { }
	global static reports.ReportInstance runAsyncReport(Id reportId) { }
	global static reports.ReportResults runReport(Id reportId, reports.ReportMetadata rmData, Boolean includeDetails) { }
	global static reports.ReportResults runReport(Id reportId, Boolean includeDetails) { }
	global static reports.ReportResults runReport(Id reportId, reports.ReportMetadata rmData) { }
	global static reports.ReportResults runReport(Id reportId) { }

}