global class RecordViewSection {
	global Integer columnCount;
	global ConnectApi.RecordColumnOrder columnOrder;
	global List<ConnectApi.AbstractRecordField> fields;
	global String heading;
	global Boolean isCollapsible;
	global RecordViewSection() { }
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}