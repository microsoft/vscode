global class Recommendations {
	global Object clone() { }
	global static ConnectApi.RecommendationAudience createRecommendationAudience(String communityId, ConnectApi.RecommendationAudienceInput recommendationAudience) { }
	global static ConnectApi.RecommendationAudience createRecommendationAudience(String communityId, String name) { }
	global static ConnectApi.RecommendationDefinition createRecommendationDefinition(String communityId, String name, String title, String actionUrl, String actionUrlName, String explanation) { }
	global static ConnectApi.RecommendationDefinition createRecommendationDefinition(String communityId, ConnectApi.RecommendationDefinitionInput recommendationDefinition) { }
	global static ConnectApi.ScheduledRecommendation createScheduledRecommendation(String communityId, String recommendationDefinitionId, Integer rank, Boolean enabled, String recommendationAudienceId, ConnectApi.RecommendationChannel channel) { }
	global static ConnectApi.ScheduledRecommendation createScheduledRecommendation(String communityId, String recommendationDefinitionId, Integer rank, Boolean enabled, String recommendationAudienceId) { }
	global static ConnectApi.ScheduledRecommendation createScheduledRecommendation(String communityId, ConnectApi.ScheduledRecommendationInput scheduledRecommendation) { }
	global static void deleteRecommendationAudience(String communityId, String recommendationAudienceId) { }
	global static void deleteRecommendationDefinition(String communityId, String recommendationDefinitionId) { }
	global static void deleteRecommendationDefinitionPhoto(String communityId, String recommendationDefinitionId) { }
	global static void deleteScheduledRecommendation(String communityId, String scheduledRecommendationId, Boolean deleteDefinitionIfLast) { }
	global static ConnectApi.RecommendationAudience getRecommendationAudience(String communityId, String recommendationAudienceId) { }
	global static ConnectApi.UserReferencePage getRecommendationAudienceMembership(String communityId, String recommendationAudienceId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserReferencePage getRecommendationAudienceMembership(String communityId, String recommendationAudienceId) { }
	global static ConnectApi.RecommendationAudiencePage getRecommendationAudiences(String communityId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.RecommendationAudiencePage getRecommendationAudiences(String communityId) { }
	global static ConnectApi.RecommendationDefinition getRecommendationDefinition(String communityId, String recommendationDefinitionId) { }
	global static ConnectApi.Photo getRecommendationDefinitionPhoto(String communityId, String recommendationDefinitionId) { }
	global static ConnectApi.RecommendationDefinitionPage getRecommendationDefinitions(String communityId) { }
	global static ConnectApi.RecommendationCollection getRecommendationForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectId) { }
	global static ConnectApi.RecommendationCollection getRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectCategory, ConnectApi.RecommendationActionType contextAction, String contextObjectId, ConnectApi.RecommendationChannel channel, Integer maxResults) { }
	global static ConnectApi.RecommendationCollection getRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, ConnectApi.RecommendationActionType contextAction, String contextObjectId, ConnectApi.RecommendationChannel channel, Integer maxResults) { }
	global static ConnectApi.RecommendationCollection getRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectCategory, ConnectApi.RecommendationActionType contextAction, String contextObjectId, Integer maxResults) { }
	global static ConnectApi.RecommendationCollection getRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, ConnectApi.RecommendationActionType contextAction, String contextObjectId, Integer maxResults) { }
	global static ConnectApi.RecommendationCollection getRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType contextAction, String contextObjectId, ConnectApi.RecommendationChannel channel, Integer maxResults) { }
	global static ConnectApi.RecommendationCollection getRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType contextAction, String contextObjectId, Integer maxResults) { }
	global static ConnectApi.ScheduledRecommendation getScheduledRecommendation(String communityId, String scheduledRecommendationId) { }
	global static ConnectApi.ScheduledRecommendationPage getScheduledRecommendations(String communityId, ConnectApi.RecommendationChannel channel) { }
	global static ConnectApi.ScheduledRecommendationPage getScheduledRecommendations(String communityId) { }
	global static void rejectRecommendationForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, ConnectApi.RecommendedObjectType objectEnum) { }
	global static void rejectRecommendationForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectId) { }
	global static void setTestGetRecommendationForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectId, ConnectApi.RecommendationCollection result) { }
	global static void setTestGetRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectCategory, ConnectApi.RecommendationActionType contextAction, String contextObjectId, ConnectApi.RecommendationChannel channel, Integer maxResults, ConnectApi.RecommendationCollection result) { }
	global static void setTestGetRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, ConnectApi.RecommendationActionType contextAction, String contextObjectId, ConnectApi.RecommendationChannel channel, Integer maxResults, ConnectApi.RecommendationCollection result) { }
	global static void setTestGetRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, String objectCategory, ConnectApi.RecommendationActionType contextAction, String contextObjectId, Integer maxResults, ConnectApi.RecommendationCollection result) { }
	global static void setTestGetRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType action, ConnectApi.RecommendationActionType contextAction, String contextObjectId, Integer maxResults, ConnectApi.RecommendationCollection result) { }
	global static void setTestGetRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType contextAction, String contextObjectId, ConnectApi.RecommendationChannel channel, Integer maxResults, ConnectApi.RecommendationCollection result) { }
	global static void setTestGetRecommendationsForUser(String communityId, String userId, ConnectApi.RecommendationActionType contextAction, String contextObjectId, Integer maxResults, ConnectApi.RecommendationCollection result) { }
	global static ConnectApi.RecommendationAudience updateRecommendationAudience(String communityId, String recommendationAudienceId, ConnectApi.RecommendationAudienceInput recommendationAudience) { }
	global static ConnectApi.RecommendationDefinition updateRecommendationDefinition(String communityId, String recommendationDefinitionId, String name, String title, String actionUrl, String actionUrlName, String explanation) { }
	global static ConnectApi.RecommendationDefinition updateRecommendationDefinition(String communityId, String recommendationDefinitionId, ConnectApi.RecommendationDefinitionInput recommendationDefinition) { }
	global static ConnectApi.Photo updateRecommendationDefinitionPhoto(String communityId, String recommendationDefinitionId, String fileId, Integer versionNumber) { }
	global static ConnectApi.Photo updateRecommendationDefinitionPhoto(String communityId, String recommendationDefinitionId, ConnectApi.BinaryInput fileUpload) { }
	global static ConnectApi.Photo updateRecommendationDefinitionPhotoWithAttributes(String communityId, String recommendationDefinitionId, ConnectApi.PhotoInput photo, ConnectApi.BinaryInput fileUpload) { }
	global static ConnectApi.Photo updateRecommendationDefinitionPhotoWithAttributes(String communityId, String recommendationDefinitionId, ConnectApi.PhotoInput photo) { }
	global static ConnectApi.ScheduledRecommendation updateScheduledRecommendation(String communityId, String scheduledRecommendationId, Integer rank, Boolean enabled, String recommendationAudienceId) { }
	global static ConnectApi.ScheduledRecommendation updateScheduledRecommendation(String communityId, String scheduledRecommendationId, ConnectApi.ScheduledRecommendationInput scheduledRecommendation) { }

}