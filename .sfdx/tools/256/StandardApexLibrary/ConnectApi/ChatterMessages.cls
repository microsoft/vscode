global class ChatterMessages {
	global Object clone() { }
	global static ConnectApi.ChatterConversation getConversation(String communityId, String conversationId, String pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterConversation getConversation(String conversationId, String pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterConversation getConversation(String communityId, String conversationId) { }
	global static ConnectApi.ChatterConversation getConversation(String conversationId) { }
	global static ConnectApi.ChatterConversationPage getConversations(String communityId, String pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterConversationPage getConversations(String pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterConversationPage getConversations(String communityId) { }
	global static ConnectApi.ChatterConversationPage getConversations() { }
	global static ConnectApi.ChatterMessage getMessage(String communityId, String messageId) { }
	global static ConnectApi.ChatterMessage getMessage(String messageId) { }
	global static ConnectApi.ChatterMessagePage getMessages(String communityId, String pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterMessagePage getMessages(String pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterMessagePage getMessages(String communityId) { }
	global static ConnectApi.ChatterMessagePage getMessages() { }
	global static ConnectApi.UnreadConversationCount getUnreadCount(String communityId) { }
	global static ConnectApi.UnreadConversationCount getUnreadCount() { }
	global static ConnectApi.ChatterConversationSummary markConversationRead(String communityId, String conversationId, Boolean read) { }
	global static ConnectApi.ChatterConversationSummary markConversationRead(String conversationId, Boolean read) { }
	global static ConnectApi.ChatterMessage replyToMessage(String communityId, String text, String inReplyTo) { }
	global static ConnectApi.ChatterMessage replyToMessage(String text, String inReplyTo) { }
	global static ConnectApi.ChatterConversation searchConversation(String communityId, String conversationId, String pageParam, Integer pageSize, String q) { }
	global static ConnectApi.ChatterConversation searchConversation(String conversationId, String pageParam, Integer pageSize, String q) { }
	global static ConnectApi.ChatterConversation searchConversation(String communityId, String conversationId, String q) { }
	global static ConnectApi.ChatterConversation searchConversation(String conversationId, String q) { }
	global static ConnectApi.ChatterConversationPage searchConversations(String communityId, String pageParam, Integer pageSize, String q) { }
	global static ConnectApi.ChatterConversationPage searchConversations(String pageParam, Integer pageSize, String q) { }
	global static ConnectApi.ChatterConversationPage searchConversations(String communityId, String q) { }
	global static ConnectApi.ChatterConversationPage searchConversations(String q) { }
	global static ConnectApi.ChatterMessagePage searchMessages(String communityId, String pageParam, Integer pageSize, String q) { }
	global static ConnectApi.ChatterMessagePage searchMessages(String pageParam, Integer pageSize, String q) { }
	global static ConnectApi.ChatterMessagePage searchMessages(String communityId, String q) { }
	global static ConnectApi.ChatterMessagePage searchMessages(String q) { }
	global static ConnectApi.ChatterMessage sendMessage(String communityId, String text, String recipients) { }
	global static ConnectApi.ChatterMessage sendMessage(String text, String recipients) { }

}