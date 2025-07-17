global class PromotionInputRepresentation {
	global Map<String,String> additionalFieldValues;
	global Boolean doesReuseEngagementAttributes;
	global Datetime endDateTime;
	global String name;
	global String promotionCode;
	global List<ConnectApi.RelatedPromotionRecordsInputRepresentation> relatedRecords;
	global String sourcePromotionId;
	global Datetime startDateTime;
	global PromotionInputRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}