global class OcrResult {
	global String keyEntity;
	global String keyText;
	global ConnectApi.OcrResultNormalizedText normalizedText;
	global Double probability;
	global String value;
	global OcrResult() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}