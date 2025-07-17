global class StrategyTraceNode {
	global Integer inputCount;
	global List<String> messages;
	global String nodeName;
	global Long nodeTime;
	global String nodeType;
	global Integer outputCount;
	global List<String> outputs;
	global Long totalTime;
	global StrategyTraceNode() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}