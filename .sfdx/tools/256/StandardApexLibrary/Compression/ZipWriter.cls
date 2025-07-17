global class ZipWriter {
	global ZipWriter() { }
	global compression.ZipEntry addEntry(String name, String comment, Datetime modTime, compression.Method m, Blob data) { }
	global compression.ZipEntry addEntry(String name, Blob data) { }
	global compression.ZipEntry addEntry(compression.ZipEntry prototype) { }
	global Object clone() { }
	global Blob getArchive() { }
	global List<compression.ZipEntry> getEntries() { }
	global compression.ZipEntry getEntry(String name) { }
	global Set<String> getEntryNames() { }
	global compression.Level getLevel() { }
	global compression.Method getMethod() { }
	global void removeEntry(String name) { }
	global compression.ZipWriter setLevel(compression.Level value) { }
	global compression.ZipWriter setMethod(compression.Method value) { }

}