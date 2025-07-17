global class XmlStreamWriter {
	global XmlStreamWriter() { }
	/**
	 * Close this writer and free any resources associated with the writer.
	 */
	global void close() { }
	global Boolean equals(Object obj) { }
	/**
	 * Return the XML stream as a string
	 */
	global String getXmlString() { }
	global Integer hashCode() { }
	/**
	 * Binds a URI to the default namespace This URI is bound in the scope of the current START_ELEMENT / END_ELEMENT pair.
	 */
	global void setDefaultNamespace(String uri) { }
	global String toString() { }
	/**
	 * Writes an attribute to the output stream
	 */
	global void writeAttribute(String prefix, String namespaceURI, String localName, String value) { }
	/**
	 * Writes a CData section
	 */
	global void writeCData(String data) { }
	/**
	 * Write text to the output
	 */
	global void writeCharacters(String text) { }
	/**
	 * Writes an xml comment with the data enclosed
	 */
	global void writeComment(String data) { }
	/**
	 * Writes the default namespace to the stream
	 */
	global void writeDefaultNamespace(String namesapceURI) { }
	/**
	 * Writes an empty element tag to the output
	 */
	global void writeEmptyElement(String prefix, String localName, String namesapceURI) { }
	/**
	 * Closes any start tags and writes corresponding end tags.
	 */
	global void writeEndDocument() { }
	/**
	 * Writes an end tag to the output relying on the internal state of the writer to determine the prefix and local name of the event.
	 */
	global void writeEndElement() { }
	/**
	 * Writes a namespace to the output stream If the prefix argument to this method is the empty string, "xmlns", or null this method will delegate to writeDefaultNamespace
	 */
	global void writeNamespace(String prefix, String namesapceURI) { }
	/**
	 * Writes a processing instruction
	 */
	global void writeProcessingInstruction(String target, String data) { }
	/**
	 * Write the XML Declaration.
	 */
	global void writeStartDocument(String encoding, String version) { }
	/**
	 * Writes a start tag to the output
	 */
	global void writeStartElement(String prefix, String localName, String namesapceURI) { }

}