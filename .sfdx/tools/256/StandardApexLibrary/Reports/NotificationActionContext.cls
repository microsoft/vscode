global class NotificationActionContext {
	global NotificationActionContext(reports.ReportInstance reportInstance, reports.ThresholdInformation thresholdInformation) { }
	global Object clone() { }
	global reports.ReportInstance getReportInstance() { }
	global reports.ThresholdInformation getThresholdInformation() { }

}