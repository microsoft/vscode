global class PaymentLineItem {
	global Double amount;
	global Double amountValue;
	global Double automaticReloadPaymentThresholdAmount;
	global Double automaticReloadPaymentThresholdAmountValue;
	global String label;
	global String labelValue;
	global String lineItemType;
	global String status;
	global RichMessaging.PaymentItemStatus statusValue;
	global RichMessaging.AbstractTiming timing;
	global RichMessaging.AbstractTiming timingValue;
	global PaymentLineItem(String label, Double amount, RichMessaging.AbstractTiming timing) { }
	global PaymentLineItem(String label, Double amount) { }
	global PaymentLineItem() { }
	global Object clone() { }

}