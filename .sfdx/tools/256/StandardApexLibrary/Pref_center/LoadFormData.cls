global class LoadFormData {
	global LoadFormData(Map<String,pref_center.FieldProperties> data) { }
	global LoadFormData() { }
	global void addOption(String fieldId, String value, String label) { }
	global void addOption(String fieldId, System.SelectOption option) { }
	global void addSelectedOption(String fieldId, String option) { }
	global Object clone() { }
	global void setButtonLabel(String fieldId, String label) { }
	global void setOptions(String fieldId, List<System.SelectOption> options) { }
	global void setSelectedOption(String fieldId, String optionValue) { }
	global void setSelectedOptions(String fieldId, List<String> options) { }
	global void setTextHint(String fieldId, String hintText) { }
	global void setTextValue(String fieldId, String value) { }

}