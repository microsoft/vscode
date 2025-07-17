global class XmlNode {
	/**
	 * Creates a child element node. name can not be null. if namespace is not null and prefix is null, namespace is set as default ns
	 */
	global dom.XmlNode addChildElement(String name, String namespace, String prefix) { }
	/**
	 * Creates a child comment node. text can not be null.
	 */
	global dom.XmlNode addCommentNode(String text) { }
	/**
	 * Creates a child text node. text can not be null.
	 */
	global dom.XmlNode addTextNode(String text) { }
	global Boolean equals(Object obj) { }
	/**
	 * get raw attribute value. eg: 'foo:bar' 
	 */
	global String getAttribute(String key, String keyNamespace) { }
	/**
	 * get attribute count.
	 */
	global Integer getAttributeCount() { }
	/**
	 * get attribute key at the given index.
	 */
	global String getAttributeKeyAt(Integer index) { }
	/**
	 * get attribute key namespace at the given index.
	 */
	global String getAttributeKeyNsAt(Integer index) { }
	/**
	 * get attribute value.
	 */
	global String getAttributeValue(String key, String keyNamespace) { }
	/**
	 * get attribute namespace.
	 */
	global String getAttributeValueNs(String key, String keyNamespace) { }
	/**
	 * Returns the child with specified name and namespace
	 */
	global dom.XmlNode getChildElement(String name, String namespace) { }
	/**
	 * Returns the child ELEMENTS of this node
	 */
	global List<dom.XmlNode> getChildElements() { }
	/**
	 * Returns the child nodes of this node
	 */
	global List<dom.XmlNode> getChildren() { }
	/**
	 * Returns the name of the element
	 */
	global String getName() { }
	/**
	 * Returns the namespace of the element
	 */
	global String getNamespace() { }
	/**
	 * Returns the namespace of the element
	 */
	global String getNamespaceFor(String prefix) { }
	/**
	 * Returns enumeration code that indicates the type of the XmlNode.
	 */
	global Dom.XmlNodeType getNodeType() { }
	/**
	 * Returns the parent of this element
	 */
	global dom.XmlNode getParent() { }
	/**
	 * Returns the prefix for of the given namespace. Input namespace should not be null.
	 */
	global String getPrefixFor(String namespace) { }
	/**
	 * returns the text.
	 */
	global String getText() { }
	global Integer hashCode() { }
	/**
	 * Inserts an element before the given reference element 
	 */
	global dom.XmlNode insertBefore(Object newChild, Object refChild) { }
	/**
	 * remove attribute with the given key and namespace.
	 */
	global Boolean removeAttribute(String key, String keyNamespace) { }
	/**
	 * removes the child node
	 */
	global Boolean removeChild(Object child) { }
	/**
	 * Sets attribute on the element.
	 */
	global void setAttribute(String key, String value) { }
	/**
	 * Sets attribute on the element.
	 */
	global void setAttributeNs(String key, String value, String keyNamespace, String valueNamespace) { }
	/**
	 * Returns the namespace of the element
	 */
	global void setNamespace(String prefix, String namespace) { }
	global String toString() { }

}