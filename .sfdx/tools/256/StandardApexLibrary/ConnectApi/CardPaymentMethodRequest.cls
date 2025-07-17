global class CardPaymentMethodRequest {
	global String accountId;
	global Boolean autoPay;
	global ConnectApi.CardCategory cardCategory;
	global String cardHolderFirstName;
	global String cardHolderLastName;
	global String cardHolderName;
	global String cardNumber;
	global String cardType;
	global String comments;
	global String cvv;
	global String email;
	global Integer expiryMonth;
	global Integer expiryYear;
	global String nickName;
	global Integer startMonth;
	global Integer startYear;
	global CardPaymentMethodRequest() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}