global class SelectOption {
	global SelectOption(String value, String label, Boolean disabled) { }
	global SelectOption(String value, String label) { }
	global Boolean equals(Object obj) { }
	/**
	 * True if the SelectOption is disabled
	 */
	global Boolean getDisabled() { }
	/**
	 * True if the SelectOption label should be escaped
	 */
	global Boolean getEscapeItem() { }
	/**
	 * The label for this SelectOption
	 */
	global String getLabel() { }
	/**
	 * The value for this SelectOption
	 */
	global String getValue() { }
	global Integer hashCode() { }
	/**
	 * Set the disabled value for this SelectOption
	 */
	global void setDisabled(Boolean disabled) { }
	/**
	 * Set the escapeItem value for this SelectOption
	 */
	global void setEscapeItem(Boolean disabled) { }
	/**
	 * Set the label for this SelectOption
	 */
	global void setLabel(String label) { }
	/**
	 * Set the value for this SelectOption
	 */
	global void setValue(String value) { }
	global String toString() { }

}