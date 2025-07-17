global class FieldSet {
	global String description;
	global List<Schema.FieldSetMember> fields;
	global String label;
	global String name;
	global String namespace;
	global Schema.SObjectType sobjecttype;
	global Boolean equals(Object obj) { }
	global String getDescription() { }
	global List<Schema.FieldSetMember> getFields() { }
	global String getLabel() { }
	global String getName() { }
	global String getNameSpace() { }
	global Schema.SObjectType getSObjectType() { }
	global Integer hashCode() { }
	global String toString() { }

}