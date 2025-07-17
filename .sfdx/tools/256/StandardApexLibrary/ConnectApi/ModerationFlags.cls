global class ModerationFlags {
	global Integer flagCount;
	global Map<String,Integer> flagCountByReason;
	global Boolean flaggedByMe;
	global ConnectApi.ModerationFlagsCollection flags;
	global ModerationFlags() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}