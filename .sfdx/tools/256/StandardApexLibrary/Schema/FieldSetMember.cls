global class FieldSetMember {
	global Boolean dbrequired;
	global String fieldpath;
	global String label;
	global Boolean required;
	global Schema.SObjectField sobjectfield;
	global Schema.DisplayType type;
	global Boolean equals(Object obj) { }
	global Boolean getDbRequired() { }
	global String getFieldPath() { }
	global String getLabel() { }
	global Boolean getRequired() { }
	global Schema.SObjectField getSObjectField() { }
	global Schema.DisplayType getType() { }
	global Integer hashCode() { }
	global String toString() { }

}