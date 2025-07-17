global class CdpSegmentInput {
	global Map<String,String> additionalMetadata;
	global String componentTemplateName;
	global String dataKitDevName;
	global String dataSpace;
	global String description;
	global String developerName;
	global String displayName;
	global ConnectApi.CdpSegmentEinsteinGptSegmentsUI einsteinGptSegmentsUICriteria;
	global String excludeCriteria;
	global String includeCriteria;
	global ConnectApi.CdpSegmentDbtInput includeDbt;
	global ConnectApi.CdpSegmentLookalikeInput lookalikeCriteria;
	global String lookbackPeriod;
	global ConnectApi.PublishSchedule publishSchedule;
	global String publishScheduleEndDate;
	global String publishScheduleEndDateTime;
	global String publishScheduleStartDateTime;
	global ConnectApi.SegmentCreationFlow segmentCreationFlow;
	global String segmentOnApiName;
	global String segmentOnDataGraph;
	global ConnectApi.SegmentType segmentType;
	global CdpSegmentInput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Integer hashCode() { }
	global String toString() { }

}