global class XmlStreamReader {
	global XmlStreamReader(String xml) { }
	global Boolean equals(Object obj) { }
	/**
	 * Returns the count of attributes on this START_ELEMENT, this method is only valid on a START_ELEMENT or ATTRIBUTE.
	 */
	global Integer getAttributeCount() { }
	/**
	 * Returns the localName of the attribute at the provided index
	 */
	global String getAttributeLocalName(Integer index) { }
	/**
	 * Returns the namespace of the attribute at the provided index
	 */
	global String getAttributeNamespace(Integer index) { }
	/**
	 * Returns the prefix of this attribute at the provided index
	 */
	global String getAttributePrefix(Integer index) { }
	/**
	 * Returns the XML type of the attribute at the provided index
	 */
	global String getAttributeType(Integer index) { }
	/**
	 * Returns the normalized attribute value of the attribute with the namespace and localName If the namespaceURI is null the namespace is not checked for equality
	 */
	global String getAttributeValue(String namespaceURI, String localName) { }
	/**
	 * Returns the value of the attribute at the index
	 */
	global String getAttributeValueAt(Integer index) { }
	/**
	 * Returns an integer code that indicates the type of the event the cursor is pointing to.
	 */
	global System.XmlTag getEventType() { }
	/**
	 * Returns the (local) name of the current event.
	 */
	global String getLocalName() { }
	/**
	 *  Return the current location of the processor.
	 */
	global String getLocation() { }
	/**
	 * If the current event is a START_ELEMENT or END_ELEMENT this method returns the URI of the prefix or the default namespace.
	 */
	global String getNamespace() { }
	/**
	 * Returns the count of namespaces declared on this START_ELEMENT or END_ELEMENT, this method is only valid on a START_ELEMENT, END_ELEMENT or NAMESPACE.
	 */
	global Integer getNamespaceCount() { }
	/**
	 * Returns the prefix for the namespace declared at the index.
	 */
	global String getNamespacePrefix(Integer index) { }
	/**
	 * If the current event is a START_ELEMENT or END_ELEMENT this method returns the URI of the prefix or the default namespace.
	 */
	global String getNamespaceURI(String prefix) { }
	/**
	 * Returns the uri for the namespace declared at the index.
	 */
	global String getNamespaceURIAt(Integer index) { }
	/**
	 * Get the data section of a processing instruction
	 */
	global String getPIData() { }
	/**
	 * Get the target of a processing instruction
	 */
	global String getPITarget() { }
	/**
	 *  Returns the prefix of the current event or null if the event does not have a prefix
	 */
	global String getPrefix() { }
	/**
	 * Returns the current value of the parse event as a string, this returns the string value of a CHARACTERS event, returns the value of a COMMENT, the replacement value for an ENTITY_REFERENCE, the string value of a CDATA section, the string value for a SPACE event, or the String value of the internal subset of the DTD.
	 */
	global String getText() { }
	/**
	 * Get the xml version declared on the xml declaration Returns null if none was declared
	 */
	global String getVersion() { }
	/**
	 *  returns true if the current event has a name (is a START_ELEMENT or END_ELEMENT) returns false otherwise
	 */
	global Boolean hasName() { }
	/**
	 * Returns true if there are more parsing events and false if there are no more events. This method will return false if the current state of the XMLStreamReader is END_DOCUMENT
	 */
	global Boolean hasNext() { }
	/**
	 * Return true if the current event has text, false otherwise The following events have text: CHARACTERS,DTD ,ENTITY_REFERENCE, COMMENT, SPACE
	 */
	global Boolean hasText() { }
	global Integer hashCode() { }
	/**
	 * Returns true if the cursor points to a character data event
	 */
	global Boolean isCharacters() { }
	/**
	 * Returns true if the cursor points to an end tag (otherwise false)
	 */
	global Boolean isEndElement() { }
	/**
	 * Returns true if the cursor points to a start tag (otherwise false)
	 */
	global Boolean isStartElement() { }
	/**
	 * Returns true if the cursor points to a character data event that consists of all whitespace
	 */
	global Boolean isWhitespace() { }
	/**
	 * Get next parsing event - a processor may return all contiguous character data in a single chunk, or it may split it into several chunks.
	 */
	global Integer next() { }
	/**
	 * Skips any white space (isWhiteSpace() returns true), COMMENT, or PROCESSING_INSTRUCTION, until a START_ELEMENT or END_ELEMENT is reached.
	 */
	global Integer nextTag() { }
	/**
	 * The property that requires the parser to coalesce adjacent character data sections
	 */
	global void setCoalescing(Boolean flag) { }
	/**
	 * The property used to turn on/off namespace support
	 */
	global void setNamespaceAware(Boolean flag) { }
	/**
	 * Returns a string that displays and identifies this object's properties.
	 */
	global String toString() { }

}