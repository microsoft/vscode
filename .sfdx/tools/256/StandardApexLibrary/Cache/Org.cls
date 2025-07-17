global class Org {
	global static Integer MAX_TTL_SECS;
	global Org() { }
	global Object clone() { }
	global static List<Boolean> contains(List<String> keys) { }
	global static Map<String,Boolean> contains(Set<String> keys) { }
	global static Boolean contains(String key) { }
	global static Object get(System.Type cacheBuilder, String key) { }
	global static List<Object> get(List<String> keys) { }
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
	global static cache.OrgPartition getPartition(String partitionName) { }
	global static void put(String key, Object value, Integer ttlSecs, cache.Visibility visibility, Boolean immutable) { }
	global static void put(String key, Object value, Integer ttlSecs) { }
	global static void put(String key, Object value, cache.Visibility visibility) { }
	global static void put(String key, Object value) { }
	global static Boolean remove(System.Type cacheBuilder, String key) { }
	global static List<Boolean> remove(List<String> keys) { }
	global static Boolean remove(String key) { }
global class OrgCacheException extends Exception {
	global Org.OrgCacheException(String param0, Exception param1) { }
	global Org.OrgCacheException(Exception param0) { }
	global Org.OrgCacheException(String msg) { }
	global Org.OrgCacheException() { }
	global Object clone() { }
	global String getTypeName() { }

}

}