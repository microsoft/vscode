global class SessionPartition {
	global SessionPartition(String fullyQualifiedPartitionName) { }
	global Object clone() { }
	global Map<String,Boolean> contains(Set<String> keys) { }
	global Boolean contains(String key) { }
	global static String createFullyQualifiedKey(String namespace, String partition, String key) { }
	global static String createFullyQualifiedPartition(String namespace, String partition) { }
	global Object get(System.Type cacheBuilder, String key) { }
	global Map<String,Object> get(Set<String> keys) { }
	global Object get(String key) { }
	global Long getAvgGetSize() { }
	global Long getAvgGetTime() { }
	global Long getAvgValueSize() { }
	global Double getCapacity() { }
	global Set<String> getKeys() { }
	global Long getMaxGetSize() { }
	global Long getMaxGetTime() { }
	global Long getMaxValueSize() { }
	global Double getMissRate() { }
	global String getName() { }
	global Long getNumKeys() { }
	global Boolean isAvailable() { }
	global void put(String key, Object value, Integer ttlSecs, cache.Visibility visibility, Boolean immutable) { }
	global void put(String key, Object value, Integer ttlSecs) { }
	global void put(String key, Object value, cache.Visibility visibility) { }
	global void put(String key, Object value) { }
	global Boolean remove(System.Type cacheBuilder, String key) { }
	global Boolean remove(String key) { }
	global static void validateCacheBuilder(System.Type cacheBuilder) { }
	global static void validateKey(Boolean isDefault, String key) { }
	global static void validateKeyValue(Boolean isDefault, String key, Object value) { }
	global static void validateKeys(Boolean isDefault, List<String> keys) { }
	global static void validateKeys(Boolean isDefault, Set<String> keys) { }
	global static void validatePartitionName(String name) { }

}