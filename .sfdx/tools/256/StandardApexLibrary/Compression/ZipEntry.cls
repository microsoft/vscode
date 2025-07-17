global class ZipEntry {
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global String getComment() { }
	global Long getCompressedSize() { }
	global Blob getContent() { }
	global Long getCrc() { }
	global Datetime getLastModifiedTime() { }
	global compression.Method getMethod() { }
	global String getName() { }
	global Long getUncompressedSize() { }
	global Integer hashCode() { }
	global compression.ZipEntry setComment(String comment) { }
	global compression.ZipEntry setContent(Blob b) { }
	global compression.ZipEntry setLastModifiedTime(Datetime modTime) { }
	global compression.ZipEntry setMethod(compression.Method m) { }
	global String toString() { }

}