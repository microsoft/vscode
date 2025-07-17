global class ErrorRepresentation {
	global String code;
	global Boolean isConflictProvider;
	global Boolean isConflictTime;
	global Boolean isFatal;
	global Boolean isRetryable;
	global String message;
	global ErrorRepresentation() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}