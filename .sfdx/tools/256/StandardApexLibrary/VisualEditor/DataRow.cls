global class DataRow {
	global DataRow(String label, Object value, Boolean selected) { }
	global DataRow(String label, Object value) { }
	global Object clone() { }
	global Integer compareTo(VisualEditor.DataRow o) { }
	global String getLabel() { }
	global Object getValue() { }
	global Boolean isSelected() { }

}