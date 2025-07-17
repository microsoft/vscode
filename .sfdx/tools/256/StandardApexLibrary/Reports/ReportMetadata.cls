global class ReportMetadata {
	global ReportMetadata(String name, String developerName, Id id, List<reports.GroupingInfo> groupingsAcross, List<reports.GroupingInfo> groupingsDown, List<String> aggregates, List<reports.BucketField> buckets, List<String> detailColumns, String reportBooleanFilter, List<reports.ReportFilter> reportFilters, List<String> historicalSnapshotDates, reports.ReportFormat reportFormat, reports.ReportType reportType, String currencyCode, String scope, String division, List<reports.SortColumn> sortBy, reports.StandardDateFilter standardDateFilter, Boolean hasDetailRows, Boolean hasRecordCount, List<reports.StandardFilter> standardFilters, String description, Boolean showSubtotals, Boolean showGrandTotal, reports.TopRows topRows, Map<String,reports.ReportCsf> customSummaryFormula, List<reports.CrossFilter> crossFilters) { }
	global ReportMetadata() { }
	global Object clone() { }
	global List<String> getAggregates() { }
	global List<reports.BucketField> getBuckets() { }
	global List<reports.CrossFilter> getCrossFilters() { }
	global String getCurrencyCode() { }
	global Map<String,reports.ReportCsf> getCustomSummaryFormula() { }
	global String getDescription() { }
	global List<String> getDetailColumns() { }
	global String getDeveloperName() { }
	global String getDivision() { }
	global List<reports.GroupingInfo> getGroupingsAcross() { }
	global List<reports.GroupingInfo> getGroupingsDown() { }
	global Boolean getHasDetailRows() { }
	global Boolean getHasRecordCount() { }
	global List<String> getHistoricalSnapshotDates() { }
	global Id getId() { }
	global String getName() { }
	global String getReportBooleanFilter() { }
	global List<reports.ReportFilter> getReportFilters() { }
	global reports.ReportFormat getReportFormat() { }
	global reports.ReportType getReportType() { }
	global String getScope() { }
	global Boolean getShowGrandTotal() { }
	global Boolean getShowSubtotals() { }
	global List<reports.SortColumn> getSortBy() { }
	global reports.StandardDateFilter getStandardDateFilter() { }
	global List<reports.StandardFilter> getStandardFilters() { }
	global reports.TopRows getTopRows() { }
	global void setAggregates(List<String> aggregates) { }
	global void setBuckets(List<reports.BucketField> buckets) { }
	global void setCrossFilters(List<reports.CrossFilter> crossFilters) { }
	global void setCurrencyCode(String currencyCode) { }
	global void setCustomSummaryFormula(Map<String,reports.ReportCsf> customSummaryFormula) { }
	global void setDescription(String description) { }
	global void setDetailColumns(List<String> detailColumns) { }
	global void setDeveloperName(String developerName) { }
	global void setDivision(String division) { }
	global void setGroupingsAcross(List<reports.GroupingInfo> groupingsAcross) { }
	global void setGroupingsDown(List<reports.GroupingInfo> groupingsDown) { }
	global void setHasDetailRows(Boolean hasDetailRows) { }
	global void setHasRecordCount(Boolean hasRecordCount) { }
	global void setHistoricalSnapshotDates(List<String> historicalSnapshotDates) { }
	global void setId(Id id) { }
	global void setName(String name) { }
	global void setReportBooleanFilter(String reportBooleanFilter) { }
	global void setReportFilters(List<reports.ReportFilter> reportFilters) { }
	global void setReportFormat(String value) { }
	global void setReportFormat(reports.ReportFormat reportFormat) { }
	global void setReportType(reports.ReportType reportType) { }
	global void setScope(String scope) { }
	global void setShowGrandTotal(Boolean showGrandTotal) { }
	global void setShowSubtotals(Boolean showSubtotals) { }
	global void setSortBy(List<reports.SortColumn> sortBy) { }
	global void setStandardDateFilter(reports.StandardDateFilter standardDateFilter) { }
	global void setStandardFilters(List<reports.StandardFilter> standardFilters) { }
	global void setTopRows(reports.TopRows topRows) { }
	global String toString() { }

}