global class DynamicPickListRows {
	global DynamicPickListRows(List<VisualEditor.DataRow> rows, Boolean containsAllRows) { }
	global DynamicPickListRows(List<VisualEditor.DataRow> rows) { }
	global DynamicPickListRows() { }
	global void addAllRows(List<VisualEditor.DataRow> rows) { }
	global void addRow(VisualEditor.DataRow row) { }
	global Object clone() { }
	global Boolean containsAllRows() { }
	global VisualEditor.DataRow get(Integer i) { }
	global List<VisualEditor.DataRow> getDataRows() { }
	global void setContainsAllRows(Boolean containsAllRows) { }
	global Integer size() { }
	global void sort() { }

}