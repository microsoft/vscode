global class Cursor {
	global Object clone() { }
	global List<SObject> fetch(Integer start, Integer advanceBy) { }
	global Integer getNumRecords() { }
global enum DeleteFilter {
DELETED_ROWS_ONLY,
NO_DELETED_ROWS,
NO_DELETED_SHARING_ROWS,
NO_FILTER
}

}