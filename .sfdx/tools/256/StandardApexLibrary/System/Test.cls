global class Test {
	global Test() { }
	global static void calculatePermissionSetGroup(List<String> psgIds) { }
	global static void calculatePermissionSetGroup(String psgId) { }
	global static void clearApexPageMessages() { }
	global Object clone() { }
	global static void createSoqlStub(Schema.SObjectType targetType, System.SoqlStubProvider soqlStub) { }
	global static Object createStub(System.Type parentType, System.StubProvider stubProvider) { }
	global static SObject createStubQueryRow(Schema.SObjectType targetType, Map<String,Object> fieldMapWithRelationshipKeys) { }
	global static List<SObject> createStubQueryRows(Schema.SObjectType targetType, List<Map<String,Object>> fieldMapWithRelationshipKeysForMultipleRows) { }
	global static void enableChangeDataCapture() { }
	global static List<Id> enqueueBatchJobs(Integer n) { }
	global static eventbus.TestBroker getEventBus() { }
	global static System.ExternalServiceTest getExternalService() { }
	global static List<Id> getFlexQueueOrder() { }
	global static Id getStandardPricebookId() { }
	global static Object invokeContinuationMethod(Object controller, System.Continuation continuation) { }
	global static Component.apex.page invokePage(System.PageReference p) { }
	global static Boolean isRunningTest() { }
	global static Boolean isSoqlStubDefined(Schema.SObjectType targetType) { }
	global static List<SObject> loadData(Schema.SObjectType sobjectType, String staticResourceName) { }
	global static QuickAction.SendEmailQuickActionDefaults newSendEmailQuickActionDefaults(Id contextId, Id replyToId) { }
	global static void setContinuationResponse(String label, System.HttpResponse response) { }
	global static void setCreatedDate(Id id, Datetime dt) { }
	global static void setCurrentPage(System.PagerReference pageReference) { }
	global static void setCurrentPageReference(System.PagerReference pageReference) { }
	global static void setFixedSearchResults(List<String> searchResultsIds) { }
	global static void setMock(System.Type interfaceType, Object mock) { }
	global static void setReadOnlyApplicationMode(Boolean readOnlyApplicationMode) { }
	global static void startTest() { }
	global static void stopTest() { }
	global static void testSandboxPostCopyScript(System.SandboxPostCopy script, Id organizationId, Id sandboxId, String sandboxName, Boolean isRunAsAutoProcUser) { }
	global static void testSandboxPostCopyScript(System.SandboxPostCopy script, Id organizationId, Id sandboxId, String sandboxName) { }

}