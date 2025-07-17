global class Document {
	global Document() { }
	/**
	 * Create root element node. name can not be null. if namespace is not null and prefix is null, namespace is set as default ns
	 */
	global dom.XmlNode createRootElement(String name, String namespace, String prefix) { }
	global Boolean equals(Object obj) { }
	/**
	 * Return root element node. null, root node is not created yet
	 */
	global dom.XmlNode getRootElement() { }
	global Integer hashCode() { }
	/**
	 * parse and load the specified XML
	 */
	global void load(String xml) { }
	global String toString() { }
	/**
	 * returns the XML as string
	 */
	global String toXmlString() { }

}