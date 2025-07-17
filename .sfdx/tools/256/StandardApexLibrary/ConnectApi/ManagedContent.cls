global class ManagedContent {
	global Object clone() { }
	global static ConnectApi.ManagedContentDocumentClone cloneManagedContentDocument(String contentKeyOrId, ConnectApi.ManagedContentDocumentCloneInput ManagedContentCloneInputParam) { }
	global static ConnectApi.ManagedContentDocument createManagedContent(ConnectApi.ManagedContentDocumentInput ManagedContentInputParam) { }
	global static ConnectApi.ManagedContentProviderInstance createManagedContentProvider(ConnectApi.ManagedContentProviderInput providerInstanceInput) { }
	global static ConnectApi.ManagedContentVersionOutput createManagedContentVersion(String contentSpaceId, ConnectApi.ManagedContentVersionInput contentVersion, ConnectApi.BinaryInput contentData) { }
	global static ConnectApi.ManagedContentVersionOutput createManagedContentVersion(String contentSpaceId, ConnectApi.ManagedContentVersionInput contentVersion) { }
	global static ConnectApi.ManagedContentDocument createManagedContentWithMedia(ConnectApi.ManagedContentDocumentInput ManagedContentInputParam, ConnectApi.BinaryInput contentData) { }
	global static void deleteManagedContent(String contentSpaceId, String managedContentId) { }
	global static void deleteManagedContentProviderInstance(String providerInstanceId) { }
	global static void deleteManagedContentSpace(String contentSpaceId) { }
	global static void deleteManagedContentVariant(String variantId) { }
	global static ConnectApi.ManagedContentVersionCollection getAllContent(String channelId, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean includeMetadata, String startDate, String endDate, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getAllContent(String channelId, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean includeMetadata, String startDate, String endDate) { }
	global static ConnectApi.ManagedContentChannelCollection getAllDeliveryChannels(Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ManagedContentVersionCollection getAllManagedContent(String communityId, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getAllManagedContent(String communityId, Integer pageParam, Integer pageSize, String language, String managedContentType) { }
	global static ConnectApi.ManagedContentVersionCollection getContentByContentKeys(String channelId, List<String> contentKeys, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean includeMetadata, String startDate, String endDate, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getContentByIds(String channelId, List<String> managedContentIds, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean includeMetadata, String startDate, String endDate, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getContentByIds(String channelId, List<String> managedContentIds, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean includeMetadata, String startDate, String endDate) { }
	global static ConnectApi.MCSFolderShareTargetCollection getMCSFolderShareTargets(String folderId) { }
	global static ConnectApi.MCSFolderShareCollection getMCSFolderShares(String folderId) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByContentKeys(String communityId, List<String> contentKeys, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByIds(String communityId, List<String> managedContentIds, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByIds(String communityId, List<String> managedContentIds, Integer pageParam, Integer pageSize, String language, String managedContentType) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByTopics(String communityId, List<String> topics, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByTopics(String communityId, List<String> topics, Integer pageParam, Integer pageSize, String language, String managedContentType) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByTopicsAndContentKeys(String communityId, List<String> contentKeys, List<String> topics, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByTopicsAndIds(String communityId, List<String> managedContentIds, List<String> topics, Integer pageParam, Integer pageSize, String language, String managedContentType, Boolean showAbsoluteUrl) { }
	global static ConnectApi.ManagedContentVersionCollection getManagedContentByTopicsAndIds(String communityId, List<String> managedContentIds, List<String> topics, Integer pageParam, Integer pageSize, String language, String managedContentType) { }
	global static ConnectApi.ManagedContentProviderCollection getManagedContentProviders() { }
	global static ConnectApi.ManagedContentSpace getManagedContentSpace(String contentSpaceId) { }
	global static ConnectApi.MCSFolderShareCollection patchMCSFolderShares(String folderId, ConnectApi.MCSFolderShareCollectionUpdateInput mcsFolderShareCollectionUpdateInput) { }
	global static ConnectApi.ManagedContentPublishOutput publish(ConnectApi.ManagedContentPublishInput publishInput) { }
	global static ConnectApi.ManagedContentVariant replaceManagedContentVariant(String variantId, ConnectApi.ManagedContentVariantUpdateInput ManagedContentVariantInputParam) { }
	global static ConnectApi.ManagedContentVariant replaceManagedContentVariantWithMedia(String variantId, ConnectApi.ManagedContentVariantUpdateInput ManagedContentVariantInputParam, ConnectApi.BinaryInput contentData) { }
	global static ConnectApi.ManagedContentUnpublishOutput unpublish(ConnectApi.ManagedContentUnpublishInput unpublishInput) { }
	global static ConnectApi.ManagedContentOutput updateManagedContent(String contentSpaceId, String managedContentId, ConnectApi.ManagedContentInput contentVersion) { }

}