global class Table {
	global List<DataSource.Column> columns;
	global String description;
	global String labelPlural;
	global String labelSingular;
	global String name;
	global String nameColumn;
	global Table() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.Table get(String name, String labelSingular, String labelPlural, String description, String nameColumn, List<DataSource.Column> columns) { }
	global static DataSource.Table get(String name, String nameColumn, List<DataSource.Column> columns) { }
	global Integer hashCode() { }
	global void logWarning(String msg) { }
	global void throwException(String msg) { }

}