global class Activation {
	global String activationDefinitionId;
	global ConnectApi.ActivationPlatformCustomerFileSource activationPlatformCustomerFileSourceEnum;
	global String activationRecordSchema;
	global ConnectApi.ActivationTarget activationTarget;
	global String activationTargetId;
	global String activationTargetName;
	global ConnectApi.QueryPathConfigList activationTargetObjectPath;
	global ConnectApi.ActivationTargetSubject activationTargetSubject;
	global ConnectApi.ActivationAttributeConfig attributesConfig;
	global ConnectApi.ContactPointsConfig contactPointsConfig;
	global String curatedEntityApiName;
	global String curatedEntityId;
	global String curatedEntityName;
	global ConnectApi.ActivationDataSources dataSourcesConfig;
	global String dataSpaceName;
	global String dataspaceId;
	global String description;
	global String developerName;
	global ConnectApi.DmoFilterConfig directDmoFiltersConfig;
	global Boolean enabled;
	global String historyAudienceDmoApiName;
	global String historyAudienceDmoLabel;
	global Datetime lastPublishDate;
	global ConnectApi.DataExportRunStatus lastPublishStatus;
	global String lastPublishStatusErrorMsg;
	global String latestAudienceDmoApiName;
	global String latestAudienceDmoLabel;
	global Datetime latestAudienceDmoLastRunTimestamp;
	global String membershipName;
	global ConnectApi.DataExportRefreshMode refreshType;
	global ConnectApi.DmoFilterConfig relatedDmoFiltersConfig;
	global String segmentApiName;
	global String segmentDefinitionId;
	global String segmentId;
	global Boolean shouldExcludeDeletes;
	global Boolean shouldExcludeUpdates;
	global ConnectApi.StaticDataConfig staticDataConfig;
	global ConnectApi.ActivationStatus status;
	global Activation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}