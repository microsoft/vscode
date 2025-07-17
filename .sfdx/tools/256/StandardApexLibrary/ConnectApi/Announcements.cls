global class Announcements {
	global Object clone() { }
	global static void deleteAnnouncement(String communityId, String announcementId) { }
	global static ConnectApi.Announcement getAnnouncement(String communityId, String announcementId) { }
	global static ConnectApi.AnnouncementPage getAnnouncements(String communityId, String parentId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.AnnouncementPage getAnnouncements(String communityId, String parentId) { }
	global static ConnectApi.Announcement postAnnouncement(String communityId, ConnectApi.AnnouncementInput announcement) { }
	global static ConnectApi.Announcement updateAnnouncement(String communityId, String announcementId, Datetime expirationDate) { }

}