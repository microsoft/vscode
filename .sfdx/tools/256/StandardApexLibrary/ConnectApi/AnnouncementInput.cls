global class AnnouncementInput {
	global ConnectApi.MessageBodyInput body;
	global Datetime expirationDate;
	global String feedItemId;
	global Boolean isArchived;
	global String parentId;
	global Boolean sendEmails;
	global AnnouncementInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}