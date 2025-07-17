global class ContentHubUploadItemRepresentation {
	global List<ConnectApi.ContentHubUploadUrlRepresentation> contentHubUploadUrlRepresentations;
	global String fileId;
	global String fileName;
	global String fileUploadUrl;
	global Boolean isMultiPartUpload;
	global Double partSize;
	global String repositoryId;
	global String uploadId;
	global ContentHubUploadItemRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}