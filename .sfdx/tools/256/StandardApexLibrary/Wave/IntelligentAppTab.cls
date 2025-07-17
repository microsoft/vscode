global class IntelligentAppTab {
	global IntelligentAppTab() { }
	global Object clone() { }
	global static Map<String,Object> getDashboardsJson(String templateSourceId, String folderId) { }
	global static Map<String,Object> getFolderJson(String folderId) { }
	global static List<Object> getIntelligentAppFoldersWithAppVariationJson(String templateSourceId, Boolean includeType) { }

}