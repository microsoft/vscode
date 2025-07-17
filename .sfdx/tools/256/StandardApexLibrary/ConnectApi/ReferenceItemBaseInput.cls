global class ReferenceItemBaseInput {
	global Double amount;
	global Integer billDayOfMonth;
	global String billToContactId;
	global String billingAccountId;
	global ConnectApi.BillingAddressRequest billingAddress;
	global ConnectApi.BillingMethodEnum billingMethod;
	global String billingScheduleEndDate;
	global String billingScheduleStartDate;
	global Integer billingStartMonth;
	global Integer billingTerm;
	global ConnectApi.InvoiceBillingTermUnitEnum billingTermUnit;
	global String billingTreatmentId;
	global ConnectApi.BillingTypeEnum billingType;
	global String currencyIsoCode;
	global String customInvoiceGroupKey;
	global String externalReference;
	global String externalReferenceItem;
	global ConnectApi.InvoiceGroupTypeEnum invoiceGroupType;
	global String paymentTermId;
	global ConnectApi.PeriodBoundaryEnum periodBoundary;
	global String productId;
	global String productName;
	global String prorationPolicyId;
	global String referenceId;
	global String referenceItemId;
	global ConnectApi.BillingAddressRequest shippingAddress;
	global String taxTreatmentId;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}