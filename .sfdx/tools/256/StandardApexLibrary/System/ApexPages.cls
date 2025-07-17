global class ApexPages {
	global static void addMessage(ApexPages.Message message) { }
	global static void addMessages(Exception ex) { }
	global static System.PageReference currentPage() { }
	global static List<ApexPages.Message> getMessages() { }
	global static Boolean hasMessages(ApexPages.Severity severity) { }
	global static Boolean hasMessages() { }

}