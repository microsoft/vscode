global class CdpSegmentOutput {
	global String apiName;
	global String dataSpace;
	global String description;
	global String developerName;
	global String displayName;
	global String excludeCriteria;
	global String includeCriteria;
	global ConnectApi.CdpSegmentDbtPipeline includeDbt;
	global ConnectApi.CdpSegmentLookalike lookalikeCriteria;
	global String lookbackPeriod;
	global String marketSegmentDefinitionId;
	global String marketSegmentId;
	global String nextPublishDateTime;
	global String publishInterval;
	global String publishScheduleEndDate;
	global String publishScheduleEndDateTime;
	global String publishScheduleStartDateTime;
	global String publishStatus;
	global ConnectApi.CdpSegmentMembershipTableOutput segmentMembershipDmo;
	global String segmentMembershipTable;
	global String segmentOnApiName;
	global String segmentOnDataGraph;
	global String segmentOnId;
	global String segmentStatus;
	global String segmentType;
	global CdpSegmentOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}