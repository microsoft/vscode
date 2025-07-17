global class ReferralEventInput {
	global Datetime activityDateTime;
	global String contactFieldForLocale;
	global String contactId;
	global String contactLocale;
	global String email;
	global ConnectApi.EventTypeResource eventType;
	global String firstName;
	global String friendJournalSubtype;
	global Datetime joiningDate;
	global String lastName;
	global Boolean optInWhatsApp;
	global String orderReferenceId;
	global String productId;
	global Double purchaseAmount;
	global Integer purchaseQuantity;
	global Map<String,String> referralAdditionalAttributes;
	global String referralChannel;
	global String referralCode;
	global List<String> referralEmails;
	global String referralStage;
	global Map<String,String> transactionJournalAdditionalAttributes;
	global ReferralEventInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}