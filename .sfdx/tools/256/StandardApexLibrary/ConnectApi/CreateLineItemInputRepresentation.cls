global class CreateLineItemInputRepresentation {
	global String adQuoteId;
	global ConnectApi.MediaPlanConfigurationInputEnum configurationInput;
	global ConnectApi.CreateLineItemConfigurationOptionsInputRepresentation configurationOptions;
	global String contextId;
	global List<ConnectApi.CreateLineItemMapsInputRepresentation> lineItems;
	global String mediaPlanEndDate;
	global String mediaPlanStartDate;
	global ConnectApi.MediaPlanPricingPreferenceEnum pricingPref;
	global String quoteId;
	global CreateLineItemInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}