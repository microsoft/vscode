global class Answers {
	global Answers() { }
	global Object clone() { }
	global static List<Id> findSimilar(SObject question) { }
	global static void setBestReply(String questionId, String bestReplyId) { }

}