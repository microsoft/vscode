global class DescribeSObjectResult {
	global Boolean accessible;
	global String associateentitytype;
	global String associateparententity;
	global List<Schema.ChildRelationship> childrelationships;
	global Boolean createable;
	global Boolean custom;
	global Boolean customsetting;
	global Boolean datatranslationenabled;
	global String defaultimplementation;
	global Boolean deletable;
	global Boolean deprecatedandhidden;
	global Boolean feedenabled;
	global Schema.SObjectTypeFields fields;
	global Schema.SObjectTypeFieldSets fieldsets;
	global Boolean hassubtypes;
	global String implementedby;
	global String implementsinterfaces;
	global Boolean isinterface;
	global Boolean issubtype;
	global String keyprefix;
	global String label;
	global String labelplural;
	global String localname;
	global Boolean mergeable;
	global Boolean mruenabled;
	global String name;
	global Boolean queryable;
	global List<Schema.RecordTypeInfo> recordtypeinfos;
	global Map<String,Schema.RecordTypeInfo> recordtypeinfosbydevelopername;
	global Map<Id,Schema.RecordTypeInfo> recordtypeinfosbyid;
	global Map<String,Schema.RecordTypeInfo> recordtypeinfosbyname;
	global Boolean searchable;
	global Schema.SObjectDescribeOptions sobjectdescribeoption;
	global Schema.SObjectType sobjecttype;
	global Boolean undeletable;
	global Boolean updateable;
	global Boolean equals(Object obj) { }
	global String getAssociateEntityType() { }
	global String getAssociateParentEntity() { }
	global List<Schema.ChildRelationship> getChildRelationships() { }
	global Boolean getDataTranslationEnabled() { }
	global String getDefaultImplementation() { }
	global Schema.SObjectTypeFieldSets getFieldSets() { }
	global Schema.SObjectTypeFields getFields() { }
	global Boolean getHasSubtypes() { }
	global String getImplementedBy() { }
	global String getImplementsInterfaces() { }
	global Boolean getIsInterface() { }
	global Boolean getIsSubtype() { }
	global String getKeyPrefix() { }
	global String getLabel() { }
	global String getLabelPlural() { }
	global String getLocalName() { }
	global String getName() { }
	global List<Schema.RecordTypeInfo> getRecordTypeInfos() { }
	global Map<String,Schema.RecordTypeInfo> getRecordTypeInfosByDeveloperName() { }
	global Map<Id,Schema.RecordTypeInfo> getRecordTypeInfosById() { }
	global Map<String,Schema.RecordTypeInfo> getRecordTypeInfosByName() { }
	global Schema.SObjectDescribeOptions getSObjectDescribeOption() { }
	global Schema.SObjectType getSObjectType() { }
	global Integer hashCode() { }
	global Boolean isAccessible() { }
	global Boolean isCreateable() { }
	global Boolean isCustom() { }
	global Boolean isCustomSetting() { }
	global Boolean isDeletable() { }
	global Boolean isDeprecatedAndHidden() { }
	global Boolean isFeedEnabled() { }
	global Boolean isMergeable() { }
	global Boolean isMruEnabled() { }
	global Boolean isQueryable() { }
	global Boolean isSearchable() { }
	global Boolean isUndeletable() { }
	global Boolean isUpdateable() { }
	global String toString() { }

}