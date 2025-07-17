global class DatacloudImport {
	global Integer duplicatesSkippedCount;
	global Integer errorCount;
	global String errorMessageDescriptionUrl;
	global List<ConnectApi.DatacloudImportStatus> importStatus;
	global Boolean orgAllowsDuplicates;
	global Integer successCount;
	global DatacloudImport() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}