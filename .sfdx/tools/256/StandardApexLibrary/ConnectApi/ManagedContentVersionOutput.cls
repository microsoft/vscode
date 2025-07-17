global class ManagedContentVersionOutput {
	global ConnectApi.ManagedContentAssociations associations;
	global String authoredManagedContentId;
	global Map<String,Object> body;
	global String contentKey;
	global ConnectApi.Reference createdByReference;
	global Datetime createdDate;
	global String externalId;
	global String id;
	global ConnectApi.Reference lastUpdatedByReference;
	global String managedContentId;
	global String primaryLanguage;
	global Datetime publishDate;
	global ConnectApi.ManagedContentStatus status;
	global String title;
	global String type;
	global String typeLabel;
	global Datetime updatedDate;
	global String urlName;
	global ManagedContentVersionOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}