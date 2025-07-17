global class ContentHub {
	global static ConnectApi.RepositoryFolderItem addRepositoryItem(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData) { }
	global static ConnectApi.RepositoryFolderItem addRepositoryItem(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData) { }
	global static ConnectApi.RepositoryFolderItem addRepositoryItem(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file) { }
	global static ConnectApi.RepositoryFolderItem addRepositoryItem(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file) { }
	global Object clone() { }
	global static void deleteRepositoryFile(String communityId, String repositoryId, String repositoryFileId) { }
	global static void deleteRepositoryFile(String repositoryId, String repositoryFileId) { }
	global static void deleteRepositoryFolder(String communityId, String repositoryId, String repositoryFolderId) { }
	global static void deleteRepositoryFolder(String repositoryId, String repositoryFolderId) { }
	global static ConnectApi.ContentHubAllowedItemTypeCollection getAllowedItemTypes(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemType filter) { }
	global static ConnectApi.ContentHubAllowedItemTypeCollection getAllowedItemTypes(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemType filter) { }
	global static ConnectApi.ContentHubAllowedItemTypeCollection getAllowedItemTypes(String communityId, String repositoryId, String repositoryFolderId) { }
	global static ConnectApi.ContentHubAllowedItemTypeCollection getAllowedItemTypes(String repositoryId, String repositoryFolderId) { }
	global static ConnectApi.FilePreview getFilePreview(String communityId, String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType, Integer startPageNumber, Integer endPageNumber) { }
	global static ConnectApi.FilePreview getFilePreview(String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType, Integer startPageNumber, Integer endPageNumber) { }
	global static ConnectApi.FilePreview getFilePreview(String communityId, String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType) { }
	global static ConnectApi.FilePreview getFilePreview(String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType) { }
	global static ConnectApi.ContentHubItemTypeDetail getItemType(String communityId, String repositoryId, String repositoryItemTypeId) { }
	global static ConnectApi.ContentHubItemTypeDetail getItemType(String repositoryId, String repositoryItemTypeId) { }
	global static ConnectApi.FilePreviewCollection getPreviews(String communityId, String repositoryId, String repositoryFileId) { }
	global static ConnectApi.FilePreviewCollection getPreviews(String repositoryId, String repositoryFileId) { }
	global static ConnectApi.ContentHubRepositoryCollection getRepositories(String communityId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ContentHubRepositoryCollection getRepositories(Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ContentHubRepositoryCollection getRepositories(String communityId) { }
	global static ConnectApi.ContentHubRepositoryCollection getRepositories() { }
	global static ConnectApi.ContentHubRepository getRepository(String communityId, String repositoryId) { }
	global static ConnectApi.ContentHubRepository getRepository(String repositoryId) { }
	global static ConnectApi.RepositoryFileDetail getRepositoryFile(String communityId, String repositoryId, String repositoryFileId, Boolean includeExternalFilePermissionsInfo) { }
	global static ConnectApi.RepositoryFileDetail getRepositoryFile(String repositoryId, String repositoryFileId, Boolean includeExternalFilePermissionsInfo) { }
	global static ConnectApi.RepositoryFileDetail getRepositoryFile(String communityId, String repositoryId, String repositoryFileId) { }
	global static ConnectApi.RepositoryFileDetail getRepositoryFile(String repositoryId, String repositoryFileId) { }
	global static ConnectApi.RepositoryFolderDetail getRepositoryFolder(String communityId, String repositoryId, String repositoryFolderId) { }
	global static ConnectApi.RepositoryFolderDetail getRepositoryFolder(String repositoryId, String repositoryFolderId) { }
	global static ConnectApi.RepositoryFolderItemsCollection getRepositoryFolderItems(String communityId, String repositoryId, String repositoryFolderId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.RepositoryFolderItemsCollection getRepositoryFolderItems(String repositoryId, String repositoryFolderId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.RepositoryFolderItemsCollection getRepositoryFolderItems(String communityId, String repositoryId, String repositoryFolderId) { }
	global static ConnectApi.RepositoryFolderItemsCollection getRepositoryFolderItems(String repositoryId, String repositoryFolderId) { }
	global static void setTestAddRepositoryItem(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData, ConnectApi.RepositoryFolderItem result) { }
	global static void setTestAddRepositoryItem(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData, ConnectApi.RepositoryFolderItem result) { }
	global static void setTestAddRepositoryItem(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file, ConnectApi.RepositoryFolderItem result) { }
	global static void setTestAddRepositoryItem(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemInput file, ConnectApi.RepositoryFolderItem result) { }
	global static void setTestGetAllowedItemTypes(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemType filter, ConnectApi.ContentHubAllowedItemTypeCollection result) { }
	global static void setTestGetAllowedItemTypes(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubItemType filter, ConnectApi.ContentHubAllowedItemTypeCollection result) { }
	global static void setTestGetAllowedItemTypes(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.ContentHubAllowedItemTypeCollection result) { }
	global static void setTestGetAllowedItemTypes(String repositoryId, String repositoryFolderId, ConnectApi.ContentHubAllowedItemTypeCollection result) { }
	global static void setTestGetFilePreview(String communityId, String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType, Integer startPageNumber, Integer endPageNumber, ConnectApi.FilePreview result) { }
	global static void setTestGetFilePreview(String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType, Integer startPageNumber, Integer endPageNumber, ConnectApi.FilePreview result) { }
	global static void setTestGetFilePreview(String communityId, String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType, ConnectApi.FilePreview result) { }
	global static void setTestGetFilePreview(String repositoryId, String repositoryFileId, ConnectApi.FilePreviewFormat formatType, ConnectApi.FilePreview result) { }
	global static void setTestGetItemType(String communityId, String repositoryId, String repositoryItemTypeId, ConnectApi.ContentHubItemTypeDetail result) { }
	global static void setTestGetItemType(String repositoryId, String repositoryItemTypeId, ConnectApi.ContentHubItemTypeDetail result) { }
	global static void setTestGetPreviews(String communityId, String repositoryId, String repositoryFileId, ConnectApi.FilePreviewCollection result) { }
	global static void setTestGetPreviews(String repositoryId, String repositoryFileId, ConnectApi.FilePreviewCollection result) { }
	global static void setTestGetRepositories(String communityId, Integer pageParam, Integer pageSize, ConnectApi.ContentHubRepositoryCollection result) { }
	global static void setTestGetRepositories(Integer pageParam, Integer pageSize, ConnectApi.ContentHubRepositoryCollection result) { }
	global static void setTestGetRepositories(String communityId, ConnectApi.ContentHubRepositoryCollection result) { }
	global static void setTestGetRepositories(ConnectApi.ContentHubRepositoryCollection result) { }
	global static void setTestGetRepository(String communityId, String repositoryId, ConnectApi.ContentHubRepository result) { }
	global static void setTestGetRepository(String repositoryId, ConnectApi.ContentHubRepository result) { }
	global static void setTestGetRepositoryFile(String communityId, String repositoryId, String repositoryFileId, Boolean includeExternalFilePermissionsInfo, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestGetRepositoryFile(String repositoryId, String repositoryFileId, Boolean includeExternalFilePermissionsInfo, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestGetRepositoryFile(String communityId, String repositoryId, String repositoryFileId, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestGetRepositoryFile(String repositoryId, String repositoryFileId, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestGetRepositoryFolder(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.RepositoryFolderDetail result) { }
	global static void setTestGetRepositoryFolder(String repositoryId, String repositoryFolderId, ConnectApi.RepositoryFolderDetail result) { }
	global static void setTestGetRepositoryFolderItems(String communityId, String repositoryId, String repositoryFolderId, Integer pageParam, Integer pageSize, ConnectApi.RepositoryFolderItemsCollection result) { }
	global static void setTestGetRepositoryFolderItems(String repositoryId, String repositoryFolderId, Integer pageParam, Integer pageSize, ConnectApi.RepositoryFolderItemsCollection result) { }
	global static void setTestGetRepositoryFolderItems(String communityId, String repositoryId, String repositoryFolderId, ConnectApi.RepositoryFolderItemsCollection result) { }
	global static void setTestGetRepositoryFolderItems(String repositoryId, String repositoryFolderId, ConnectApi.RepositoryFolderItemsCollection result) { }
	global static void setTestUpdateRepositoryFile(String communityId, String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestUpdateRepositoryFile(String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestUpdateRepositoryFile(String communityId, String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file, ConnectApi.RepositoryFileDetail result) { }
	global static void setTestUpdateRepositoryFile(String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file, ConnectApi.RepositoryFileDetail result) { }
	global static ConnectApi.RepositoryFileDetail updateRepositoryFile(String communityId, String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData) { }
	global static ConnectApi.RepositoryFileDetail updateRepositoryFile(String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file, ConnectApi.BinaryInput fileData) { }
	global static ConnectApi.RepositoryFileDetail updateRepositoryFile(String communityId, String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file) { }
	global static ConnectApi.RepositoryFileDetail updateRepositoryFile(String repositoryId, String repositoryFileId, ConnectApi.ContentHubItemInput file) { }

}