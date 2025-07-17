global class CdpSegmentContainerOutput {
	global Integer batchSize;
	global Integer offset;
	global String orderByExpression;
	global List<ConnectApi.CdpSegmentOutput> segments;
	global Integer totalSize;
	global CdpSegmentContainerOutput() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}