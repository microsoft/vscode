global class TableSelection {
	global List<DataSource.ColumnSelection> columnsSelected;
	global DataSource.Filter filter;
	global List<DataSource.Order> order;
	global String tableSelected;
	global TableSelection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }

}