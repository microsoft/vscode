global class PublishingService {
	global PublishingService() { }
	global static void archiveOnlineArticle(String articleId, Datetime scheduledDate) { }
	global static void assignDraftArticleTask(String articleId, String assigneeId, String instructions, Datetime dueDate, Boolean sendEmailNotification) { }
	global static void assignDraftTranslationTask(String translationVersionId, String assigneeId, String instructions, Datetime dueDate, Boolean sendEmailNotification) { }
	global static void cancelScheduledArchivingOfArticle(String articleId) { }
	global static void cancelScheduledPublicationOfArticle(String articleId) { }
	global Object clone() { }
	global static void completeTranslation(String articleVersionId) { }
	global static void deleteArchivedArticle(String articleId) { }
	global static void deleteArchivedArticleVersion(String articleId, Integer versionNumber) { }
	global static void deleteDraftArticle(String articleId) { }
	global static void deleteDraftTranslation(String articleVersionId) { }
	global static String editArchivedArticle(String articleId) { }
	global static String editOnlineArticle(String articleId, Boolean unpublish) { }
	global static String editPublishedTranslation(String articleId, String language, Boolean unpublish) { }
	global static void publishArticle(String articleId, Boolean flagAsNew) { }
	global static String restoreOldVersion(String articleId, Integer versionNumber) { }
	global static void scheduleForPublication(String articleId, Datetime scheduledDate) { }
	global static void setTranslationToIncomplete(String articleVersionId) { }
	global static String submitForTranslation(String articleId, String language, String assigneeId, Datetime dueDate) { }

}