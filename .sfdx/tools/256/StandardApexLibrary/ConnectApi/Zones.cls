global class Zones {
	global Object clone() { }
	global static ConnectApi.Zone getZone(String communityId, String zoneId) { }
	global static ConnectApi.ZonePage getZones(String communityId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ZonePage getZones(String communityId) { }
	global static ConnectApi.ZoneSearchPage searchInZone(String communityId, String zoneId, String q, ConnectApi.ZoneSearchResultType filter, String pageParam, Integer pageSize) { }
	global static ConnectApi.ZoneSearchPage searchInZone(String communityId, String zoneId, String q, ConnectApi.ZoneSearchResultType filter, String language) { }
	global static ConnectApi.ZoneSearchPage searchInZone(String communityId, String zoneId, String q, ConnectApi.ZoneSearchResultType filter) { }
	global static void setTestSearchInZone(String communityId, String zoneId, String q, ConnectApi.ZoneSearchResultType filter, String pageParam, Integer pageSize, ConnectApi.ZoneSearchPage result) { }
	global static void setTestSearchInZone(String communityId, String zoneId, String q, ConnectApi.ZoneSearchResultType filter, String language, ConnectApi.ZoneSearchPage result) { }
	global static void setTestSearchInZone(String communityId, String zoneId, String q, ConnectApi.ZoneSearchResultType filter, ConnectApi.ZoneSearchPage result) { }

}