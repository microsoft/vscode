global class CardPaymentMethodRequest {
	global String accountId;
	global Boolean autoPay;
	global commercepayments.CardCategory cardCategory;
	global String cardHolderFirstName;
	global String cardHolderLastName;
	global String cardHolderName;
	global String cardNumber;
	global commercepayments.CardType cardType;
	global String cvv;
	global String email;
	global Integer expiryMonth;
	global Integer expiryYear;
	global String inputCardType;
	global Integer startMonth;
	global Integer startYear;
	global CardPaymentMethodRequest(commercepayments.CardCategory cardCategory) { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}