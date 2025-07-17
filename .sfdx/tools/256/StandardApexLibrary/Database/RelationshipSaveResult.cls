global class RelationshipSaveResult {
	global String relationshipname;
	global List<Database.NestedSaveResult> saveresults;
	global Boolean equals(Object obj) { }
	global String getRelationshipName() { }
	global List<Database.NestedSaveResult> getSaveResults() { }
	global Integer hashCode() { }
	global String toString() { }

}