global class Order {
	global String columnName;
	global DataSource.OrderDirection direction;
	global String tableName;
	global Order() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.Order get(String tableName, String columnName, DataSource.OrderDirection direction) { }
	global Integer hashCode() { }

}