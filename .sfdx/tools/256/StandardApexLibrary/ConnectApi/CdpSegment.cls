global class CdpSegment {
	global Object clone() { }
	global static ConnectApi.CdpSegmentOutput createSegment(ConnectApi.CdpSegmentInput input, String dataspace) { }
	global static ConnectApi.CdpSegmentOutput createSegment(ConnectApi.CdpSegmentInput input) { }
	global static ConnectApi.CdpSegmentActionOutput deactivateSegmentByApiName(String segmentApiName) { }
	global static ConnectApi.CdpSegmentActionOutput deactivateSegmentById(String segmentId) { }
	global static void deleteSegment(String segmentApiName, String dataspace) { }
	global static void deleteSegment(String segmentApiName) { }
	global static ConnectApi.CdpSegmentActionOutput executeCountAsync(String segmentApiName, ConnectApi.CdpSegmentActionInput input) { }
	global static ConnectApi.CdpSegmentActionOutput executeCountAsync(String segmentApiName) { }
	global static ConnectApi.CdpSegmentActionOutput executePublishAdhoc(String segmentId) { }
	global static ConnectApi.CdpSegmentContainerOutput getSegment(String segmentApiName) { }
	global static ConnectApi.CdpSegmentContainerOutput getSegments() { }
	global static ConnectApi.CdpSegmentContainerOutput getSegmentsFilteredPaginated(Integer batchSize, Integer offset, String orderBy, String dataspace, String filters) { }
	global static ConnectApi.CdpSegmentContainerOutput getSegmentsFilteredPaginated(Integer batchSize, Integer offset, String orderBy, String filters) { }
	global static ConnectApi.CdpSegmentContainerOutput getSegmentsPaginated(Integer batchSize, Integer offset, String orderBy, String dataspace) { }
	global static ConnectApi.CdpSegmentContainerOutput getSegmentsPaginated(Integer batchSize, Integer offset, String orderBy) { }
	global static ConnectApi.CdpSegmentOutput updateSegment(String segmentApiName, ConnectApi.CdpSegmentInput input, String dataspace) { }
	global static ConnectApi.CdpSegmentOutput updateSegment(String segmentApiName, ConnectApi.CdpSegmentInput input) { }

}