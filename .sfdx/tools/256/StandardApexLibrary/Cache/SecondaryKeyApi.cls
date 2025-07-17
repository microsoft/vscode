global class SecondaryKeyApi {
	global Object clone() { }
	global static cache.SecondaryKeyApi get(String featureName) { }
	global void putImmediate(String key, Object value, String secondaryKey) { }
	global Boolean remove(String key) { }
	global Long scanForCount(String startKey, String endKey) { }
	global cache.ScanResult scanForKeyValues(String startKey, String endKey, Integer batchSize) { }
	global cache.ScanResult scanForMoreKeyValues(String scanLocator, Integer batchSize) { }

}