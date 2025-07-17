global class CrossFilter {
	global CrossFilter(List<reports.ReportFilter> criteria, Boolean includesObject, String primaryEntityField, String relatedEntity, String relatedEntityJoinField) { }
	global CrossFilter() { }
	global Object clone() { }
	global List<reports.ReportFilter> getCriteria() { }
	global Boolean getIncludesObject() { }
	global String getPrimaryEntityField() { }
	global String getRelatedEntity() { }
	global String getRelatedEntityJoinField() { }
	global void setCriteria(List<reports.ReportFilter> criteria) { }
	global void setIncludesObject(Boolean includesObject) { }
	global void setPrimaryEntityField(String primaryEntityField) { }
	global void setRelatedEntity(String relatedEntity) { }
	global void setRelatedEntityJoinField(String relatedEntityJoinField) { }
	global String toString() { }

}