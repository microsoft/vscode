global class Connection {
	global Connection() { }
	global Object clone() { }
	global List<DataSource.DeleteResult> deleteRows(DataSource.DeleteContext deleteContext) { }
	global void logWarning(String msg) { }
	global DataSource.TableResult query(DataSource.QueryContext queryContext) { }
	global List<DataSource.TableResult> search(DataSource.SearchContext searchContext) { }
	global List<DataSource.Table> sync() { }
	global void throwException(String msg) { }
	global List<DataSource.UpsertResult> upsertRows(DataSource.UpsertContext upsertContext) { }

}