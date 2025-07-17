global class ChatterUsers {
	global Object clone() { }
	global static void deletePhoto(String communityId, String userId) { }
	global static ConnectApi.UserActivitiesJob exportUserActivities(String communityId, String userId) { }
	global static ConnectApi.Subscription follow(String communityId, String userId, String subjectId) { }
	global static ConnectApi.UserChatterSettings getChatterSettings(String communityId, String userId) { }
	global static ConnectApi.FollowerPage getFollowers(String communityId, String userId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.FollowerPage getFollowers(String communityId, String userId) { }
	global static ConnectApi.FollowingPage getFollowings(String communityId, String userId, String filterType, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.FollowingPage getFollowings(String communityId, String userId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.FollowingPage getFollowings(String communityId, String userId, String filterType, Integer pageParam) { }
	global static ConnectApi.FollowingPage getFollowings(String communityId, String userId, Integer pageParam) { }
	global static ConnectApi.FollowingPage getFollowings(String communityId, String userId, String filterType) { }
	global static ConnectApi.FollowingPage getFollowings(String communityId, String userId) { }
	global static ConnectApi.UserGroupPage getGroups(String communityId, String userId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserGroupPage getGroups(String communityId, String userId) { }
	global static ConnectApi.Photo getPhoto(String communityId, String userId) { }
	global static ConnectApi.Reputation getReputation(String communityId, String userId) { }
	global static ConnectApi.UserDetail getUser(String communityId, String userId) { }
	global static List<ConnectApi.BatchResult> getUserBatch(String communityId, List<String> userIds) { }
	global static ConnectApi.UserGroupDetailPage getUserGroups(String communityId, String userId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserGroupDetailPage getUserGroups(String communityId, String userId) { }
	global static ConnectApi.UserPage getUsers(String communityId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserPage getUsers(String communityId) { }
	global static ConnectApi.UserActivitiesJob purgeUserActivities(String communityId, String userId) { }
	global static ConnectApi.UserGroupDetailPage searchUserGroupDetails(String communityId, String userId, String q, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserGroupDetailPage searchUserGroupDetails(String communityId, String userId, String q) { }
	global static ConnectApi.UserGroupPage searchUserGroups(String communityId, String userId, String q, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserGroupPage searchUserGroups(String communityId, String userId, String q) { }
	global static ConnectApi.UserPage searchUsers(String communityId, String q, String searchContextId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserPage searchUsers(String communityId, String q, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.UserPage searchUsers(String communityId, String q) { }
	global static ConnectApi.Photo setPhoto(String communityId, String userId, String fileId, Integer versionNumber) { }
	global static ConnectApi.Photo setPhoto(String communityId, String userId, ConnectApi.BinaryInput fileUpload) { }
	global static ConnectApi.Photo setPhotoWithAttributes(String communityId, String userId, ConnectApi.PhotoInput photo, ConnectApi.BinaryInput fileUpload) { }
	global static ConnectApi.Photo setPhotoWithAttributes(String communityId, String userId, ConnectApi.PhotoInput photo) { }
	global static void setTestSearchUsers(String communityId, String q, String searchContextId, Integer pageParam, Integer pageSize, ConnectApi.UserPage result) { }
	global static void setTestSearchUsers(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.UserPage result) { }
	global static void setTestSearchUsers(String communityId, String q, ConnectApi.UserPage result) { }
	global static ConnectApi.UserChatterSettings updateChatterSettings(String communityId, String userId, ConnectApi.GroupEmailFrequency defaultGroupEmailFrequency) { }
	global static ConnectApi.UserDetail updateUser(String communityId, String userId, ConnectApi.UserInput userInput) { }

}