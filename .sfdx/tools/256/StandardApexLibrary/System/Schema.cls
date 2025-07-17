global class Schema {
	/**
	 * Returns the category groups associated to the provided sobjects.
	 */
	global static List<Schema.DescribeDataCategoryGroupStructureResult> describeDataCategoryGroupStructures(List<Schema.DataCategoryGroupSobjectTypePair> pairs, Boolean topCategoriesOnly) { }
	/**
	 * Returns the category groups associated to the provided sobjects.
	 */
	global static List<Schema.DescribeDataCategoryGroupResult> describeDataCategoryGroups(List<String> sobjects) { }
	/**
	 * Returns the meta information for the given SObject type names. Use options to load child relationships lazily or full
	 */
	global static List<Schema.DescribeSObjectResult> describeSObjects(List<String> types, Object options) { }
	/**
	 * Returns the meta information for the given SObject type names
	 */
	global static List<Schema.DescribeSObjectResult> describeSObjects(List<String> types) { }
	/**
	 * Returns the meta information for the tabs of the provided app object
	 */
	global static List<Schema.DescribeTabSetResult> describeTabs() { }
	global static Map<String,Schema.SObjectType> getAppDescribe(String appName) { }
	global static Map<String,Schema.SObjectType> getGlobalDescribe() { }
	global static Map<String,Schema.SObjectType> getModuleDescribe(String moduleName) { }
	global static Map<String,Schema.SObjectType> getModuleDescribe() { }

}