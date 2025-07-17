global class EditCapability {
	global Boolean isEditRestricted;
	global String isEditableByMeUrl;
	global ConnectApi.Actor lastEditedBy;
	global Datetime lastEditedDate;
	global Integer latestRevision;
	global String relativeLastEditedDate;
	global EditCapability() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}