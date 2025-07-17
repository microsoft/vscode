global class PlatformAction {
	global String actionUrl;
	global String apiName;
	global String confirmationMessage;
	global ConnectApi.UserSummary executingUser;
	global Boolean groupDefault;
	global String iconUrl;
	global String id;
	global String label;
	global Datetime modifiedDate;
	global ConnectApi.Reference platformActionGroup;
	global ConnectApi.PlatformActionStatus status;
	global String subtype;
	global ConnectApi.PlatformActionType type;
	global String url;
	global PlatformAction() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}