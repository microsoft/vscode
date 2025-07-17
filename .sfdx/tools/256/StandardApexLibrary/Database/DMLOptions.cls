global class DMLOptions {
	global Boolean AllowFieldTruncation;
	global Database.DMLOptions.AssignmentRuleHeader AssignmentRuleHeader;
	global Database.DMLOptions.DuplicateRuleHeader DuplicateRuleHeader;
	global Database.DMLOptions.EmailHeader EmailHeader;
	global String LocaleOptions;
	global Boolean LocalizeErrors;
	global Boolean OptAllOrNone;
	global DMLOptions() { }
	global Object clone() { }
global class AssignmentRuleHeader {
	global String AssignmentRuleId;
	global Boolean UseDefaultRule;
	global DMLOptions.AssignmentRuleHeader() { }
	global Object clone() { }

}
global class DuplicateRuleHeader {
	global Boolean AllowSave;
	global Boolean RunAsCurrentUser;
	global DMLOptions.DuplicateRuleHeader() { }
	global Object clone() { }

}
global class EmailHeader {
	global Boolean TriggerAutoResponseEmail;
	global Boolean TriggerOtherEmail;
	global Boolean TriggerUserEmail;
	global DMLOptions.EmailHeader() { }
	global Object clone() { }

}

}