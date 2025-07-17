global class Templates {
	global Templates() { }
	global static Map<String,Object> cdpQueryMetadata(String entityType, String entityCategory, String entityName, String dataspace) { }
	global Object clone() { }
	global static Map<String,Object> getSObject(String apiName) { }
	global static List<Map<String,Object>> getSObjects() { }
	global static Map<String,Object> getTemplate(String templateIdOrApiName, String filterGroup, String options) { }
	global static Map<String,Object> getTemplate(String templateIdOrApiName) { }
	global static Map<String,Object> getTemplateConfig(String templateIdOrApiName, String filterGroup, Boolean disableApex, String options) { }
	global static Map<String,Object> getTemplateConfig(String templateIdOrApiName) { }
	global static Map<String,Object> getTemplates(wave.TemplatesSearchOptions options) { }
	global static Map<String,Object> getTemplates() { }

}