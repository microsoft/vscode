global class CommerceSubscriptionBillingSummary {
	global String billingMethod;
	global String billingPeriodAmount;
	global Integer billingTerm;
	global String billingTermUnit;
	global String billingType;
	global Datetime cancellationDate;
	global String currencyIsoCode;
	global Datetime nextBillingDate;
	global ConnectApi.BuyerPaymentMethodSummary paymentMethod;
	global ConnectApi.SavedPaymentMethodOutput savedPaymentMethod;
	global CommerceSubscriptionBillingSummary() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}