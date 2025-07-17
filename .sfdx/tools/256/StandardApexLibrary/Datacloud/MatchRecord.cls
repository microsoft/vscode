global class MatchRecord {
	global List<Datacloud.AdditionalInformationMap> additionalinformation;
	global List<Datacloud.FieldDiff> fielddiffs;
	global Double matchconfidence;
	global SObject record;
	global Boolean equals(Object obj) { }
	global List<Datacloud.AdditionalInformationMap> getAdditionalInformation() { }
	global List<Datacloud.FieldDiff> getFieldDiffs() { }
	global Double getMatchConfidence() { }
	global SObject getRecord() { }
	global Integer hashCode() { }
	global String toString() { }

}