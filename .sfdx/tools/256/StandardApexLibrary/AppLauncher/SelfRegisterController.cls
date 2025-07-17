global class SelfRegisterController {
	global SelfRegisterController() { }
	global Object clone() { }
	global static String commonSelfRegisterGetRedirectUrl(String firstname, String lastname, String email, String password, String confirmPassword, String accountId, String regConfirmUrl, String extraFields, String startUrl, Boolean includePassword, Boolean redirect, Boolean enableBuyer, String buyerParams) { }
	global static List<Map<String,Object>> getExtraFields(String extraFieldsFieldSet) { }
	global static Boolean isValidPassword(String password, String confirmPassword) { }
	global static String selfRegister(String firstname, String lastname, String email, String password, String confirmPassword, String accountId, String regConfirmUrl, String extraFields, String startUrl, Boolean includePassword) { }
	global static String selfRegisterGetRedirectUrl(String firstname, String lastname, String email, String password, String confirmPassword, String accountId, String regConfirmUrl, String extraFields, String startUrl, Boolean includePassword, Boolean redirect) { }
	global static String setExperienceId(String expId) { }

}