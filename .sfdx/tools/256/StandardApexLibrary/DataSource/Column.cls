global class Column {
	global Integer decimalPlaces;
	global String description;
	global Boolean filterable;
	global Boolean isPicklistAlphabeticallySorted;
	global Boolean isPicklistRestricted;
	global String label;
	global Integer length;
	global String name;
	global List<Map<String,String>> picklistValues;
	global String referenceTargetField;
	global String referenceTo;
	global Boolean sortable;
	global DataSource.DataType type;
	global Column() { }
	global static DataSource.Column boolean(String name) { }
	global Object clone() { }
	global static DataSource.Column currency(String name, Integer length, Integer decimalPlaces) { }
	global static DataSource.Column date(String name) { }
	global static DataSource.Column datetime(String name) { }
	global static DataSource.Column email(String name) { }
	global Boolean equals(Object obj) { }
	global static DataSource.Column externalLookup(String name, String domain) { }
	global static DataSource.Column get(String name, String label, String description, Boolean isSortable, Boolean isFilterable, DataSource.DataType type, Integer length, Integer decimalPlaces, String referenceTo, String referenceTargetField, Object picklistValuesObj, Boolean isPicklistAlphabeticallySorted, Boolean isPicklistRestricted) { }
	global static DataSource.Column get(String name, String label, String description, Boolean isSortable, Boolean isFilterable, DataSource.DataType type, Integer length, Integer decimalPlaces, String referenceTo, String referenceTargetField) { }
	global static DataSource.Column get(String name, String label, String description, Boolean isSortable, Boolean isFilterable, DataSource.DataType type, Integer length, Integer decimalPlaces) { }
	global static DataSource.Column get(String name, String label, String description, Boolean isSortable, Boolean isFilterable, DataSource.DataType type, Integer length) { }
	global Integer hashCode() { }
	global static DataSource.Column indirectLookup(String name, String domain, String targetField) { }
	global static DataSource.Column integer(String name, Integer length) { }
	global void logWarning(String msg) { }
	global static DataSource.Column lookup(String name, String domain) { }
	global static DataSource.Column multipicklist(String name, List<Map<String,String>> picklistValues, Boolean isPicklistAlphabeticallySorted, Boolean isPicklistRestricted) { }
	global static DataSource.Column multipicklist(String name, List<Map<String,String>> picklistValues) { }
	global static DataSource.Column number(String name, Integer length, Integer decimalPlaces) { }
	global static DataSource.Column percent(String name, Integer length, Integer decimalPlaces) { }
	global static DataSource.Column phone(String name) { }
	global static DataSource.Column picklist(String name, List<Map<String,String>> picklistValues, Boolean isPicklistAlphabeticallySorted, Boolean isPicklistRestricted) { }
	global static DataSource.Column picklist(String name, List<Map<String,String>> picklistValues) { }
	global static DataSource.Column text(String name, String label, Integer length) { }
	global static DataSource.Column text(String name, Integer length) { }
	global static DataSource.Column text(String name) { }
	global static DataSource.Column textarea(String name) { }
	global void throwException(String msg) { }
	global static DataSource.Column time(String name) { }
	global static DataSource.Column url(String name, Integer length) { }
	global static DataSource.Column url(String name) { }

}