global class ScanResult {
	global Boolean isDone;
	global Map<String,Object> result;
	global String scanLocator;
	global ScanResult(Map<String,Object> result, String scanLocator, Boolean isDone) { }
	global Object clone() { }

}