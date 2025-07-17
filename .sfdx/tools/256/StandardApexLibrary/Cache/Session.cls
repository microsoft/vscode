global class Session {
	global static Integer MAX_TTL_SECS;
	global Session() { }
	global Object clone() { }
	global static Map<String,Boolean> contains(Set<String> keys) { }
	global static Boolean contains(String key) { }
	global static Object get(System.Type cacheBuilder, String key) { }
	global static Map<String,Object> get(Set<String> keys) { }
	global static Object get(String key) { }
	global static Long getAvgGetSize() { }
	global static Long getAvgGetTime() { }
	global static Long getAvgValueSize() { }
	global static Double getCapacity() { }
	global static Set<String> getKeys() { }
	global static Long getMaxGetSize() { }
	global static Long getMaxGetTime() { }
	global static Long getMaxValueSize() { }
	global static Double getMissRate() { }
	global static String getName() { }
	global static Long getNumKeys() { }
	global static cache.SessionPartition getPartition(String partitionName) { }
	global static Boolean isAvailable() { }
	global static void put(String key, Object value, Integer ttlSecs, cache.Visibility visibility, Boolean immutable) { }
	global static void put(String key, Object value, Integer ttlSecs) { }
	global static void put(String key, Object value, cache.Visibility visibility) { }
	global static void put(String key, Object value) { }
	global static Boolean remove(System.Type cacheBuilder, String key) { }
	global static Boolean remove(String key) { }
global class SessionCacheException extends Exception {
	global Session.SessionCacheException(String param0, Exception param1) { }
	global Session.SessionCacheException(Exception param0) { }
	global Session.SessionCacheException(String msg) { }
	global Session.SessionCacheException() { }
	global Object clone() { }
	global String getTypeName() { }

}
global class SessionCacheNoSessionException extends Exception {
	global Session.SessionCacheNoSessionException(String param0, Exception param1) { }
	global Session.SessionCacheNoSessionException(Exception param0) { }
	global Session.SessionCacheNoSessionException(String msg) { }
	global Session.SessionCacheNoSessionException() { }
	global Object clone() { }
	global String getTypeName() { }

}

}