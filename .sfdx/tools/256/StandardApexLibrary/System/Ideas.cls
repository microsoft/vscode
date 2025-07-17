global class Ideas {
	global Ideas() { }
	global Object clone() { }
	global static List<Id> findSimilar(SObject idea) { }
	global static List<Id> getAllRecentReplies(String userId, String communityId) { }
	global static List<Id> getReadRecentReplies(String userId, String communityId) { }
	global static List<Id> getUnreadRecentReplies(String userId, String communityId) { }
	global static void markRead(String ideaId) { }

}