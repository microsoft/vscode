global class MediaPlanInputRepresentation {
	global ConnectApi.MediaASMConfigInputRepresentation configs;
	global String contextId;
	global Map<String,ConnectApi.MediaPlanObjectInputRepresentation> data;
	global List<ConnectApi.CreateLineItemMapsInputRepresentation> lineItems;
	global MediaPlanInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}