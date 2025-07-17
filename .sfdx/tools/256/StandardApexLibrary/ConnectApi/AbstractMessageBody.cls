global class AbstractMessageBody {
	global Boolean isRichText;
	global List<ConnectApi.MessageSegment> messageSegments;
	global String text;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}