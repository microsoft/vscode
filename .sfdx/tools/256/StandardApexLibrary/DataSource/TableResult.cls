global class TableResult {
	global String errorMessage;
	global String queryMoreToken;
	global List<Map<String,Object>> rows;
	global Boolean success;
	global String tableName;
	global Integer totalSize;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global static DataSource.TableResult error(String errorMessage) { }
	global static DataSource.TableResult get(Boolean success, String errorMessage, String tableName, List<Map<String,Object>> rows, Integer totalSize, String queryMoreToken) { }
	global static DataSource.TableResult get(Boolean success, String errorMessage, String tableName, List<Map<String,Object>> rows, Integer totalSize) { }
	global static DataSource.TableResult get(Boolean success, String errorMessage, String tableName, List<Map<String,Object>> rows) { }
	global static DataSource.TableResult get(DataSource.QueryContext c, List<Map<String,Object>> rows) { }
	global static DataSource.TableResult get(DataSource.TableSelection tableSelection, List<Map<String,Object>> rows) { }
	global Integer hashCode() { }

}