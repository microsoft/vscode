global class ReportResults {
	global Object clone() { }
	global Boolean getAllData() { }
	global Map<String,reports.ReportFact> getFactMap() { }
	global reports.Dimension getGroupingsAcross() { }
	global reports.Dimension getGroupingsDown() { }
	global Boolean getHasDetailRows() { }
	global reports.ReportExtendedMetadata getReportExtendedMetadata() { }
	global reports.ReportMetadata getReportMetadata() { }
	global String toString() { }

}