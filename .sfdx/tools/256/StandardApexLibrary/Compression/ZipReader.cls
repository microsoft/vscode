global class ZipReader {
	global ZipReader(Blob apexData) { }
	global Object clone() { }
	global Blob extract(String name) { }
	global Blob extract(compression.ZipEntry entry) { }
	global List<compression.ZipEntry> getEntries() { }
	global Map<String,compression.ZipEntry> getEntriesMap() { }
	global compression.ZipEntry getEntry(String name) { }
	global List<String> getEntryNames() { }

}