global class AuthRequestResult {
	global Datetime expirationDateTime;
	global System.PageReference redirectPageReference;
	global RichMessaging.AuthRequestResultStatus resultStatus;
	global AuthRequestResult(System.PageReference redirectPageReference, RichMessaging.AuthRequestResultStatus resultStatus, Datetime expirationDateTime) { }
	global Object clone() { }

}