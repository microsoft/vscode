global class CommerceSubscriptionDetail {
	global ConnectApi.CommerceSubscriptionBillingSummary billing;
	global ConnectApi.SubscriptionARCState cancelStatus;
	global Datetime endDate;
	global String id;
	global List<ConnectApi.ProcessExceptionOutput> processExceptions;
	global ConnectApi.BuyerProductSummary product;
	global Double quantity;
	global ConnectApi.ProductSellingModel sellingModel;
	global Datetime startDate;
	global Integer subscriptionTerm;
	global CommerceSubscriptionDetail() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}