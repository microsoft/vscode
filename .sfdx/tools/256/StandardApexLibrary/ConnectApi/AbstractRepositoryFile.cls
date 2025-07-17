global class AbstractRepositoryFile {
	global String checkinComment;
	global String contentBody;
	global Long contentItemSize;
	global Integer contentSize;
	global String downloadUrl;
	global String externalContentUrl;
	global String externalDocumentUrl;
	global ConnectApi.ExternalFilePermissionInformation externalFilePermissionInformation;
	global String mimeType;
	global String previewUrlThumbnail;
	global String previewUrlThumbnailBig;
	global String previewUrlThumbnailTiny;
	global String previewsUrl;
	global String title;
	global String versionId;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}