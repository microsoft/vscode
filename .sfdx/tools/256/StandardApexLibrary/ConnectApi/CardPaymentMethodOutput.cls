global class CardPaymentMethodOutput {
	global String accountId;
	global Boolean autoPay;
	global String cardBin;
	global ConnectApi.CardCategory cardCategory;
	global String cardHolderFirstName;
	global String cardHolderLastName;
	global String cardHolderName;
	global String cardLastFour;
	global String cardType;
	global ConnectApi.CardType cardTypeCategory;
	global String comments;
	global String displayCardNumber;
	global String email;
	global Integer expiryMonth;
	global Integer expiryYear;
	global String nickName;
	global Integer startMonth;
	global Integer startYear;
	global CardPaymentMethodOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}