global class QueryUtils {
	global QueryUtils() { }
	global static List<Map<String,Object>> applyLimitAndOffset(DataSource.QueryContext c, List<Map<String,Object>> rows) { }
	global Object clone() { }
	global static List<Map<String,Object>> filter(DataSource.QueryContext c, List<Map<String,Object>> rows) { }
	global static List<Map<String,Object>> filterAndSort(DataSource.QueryContext c, List<Map<String,Object>> rows) { }
	global static List<Map<String,Object>> process(DataSource.QueryContext c, List<Map<String,Object>> rows) { }
	global static List<Map<String,Object>> sort(DataSource.QueryContext c, List<Map<String,Object>> rows) { }

}