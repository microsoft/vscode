global class ChatterFeeds {
	global Object clone() { }
	global static ConnectApi.ChatterStream createStream(String communityId, ConnectApi.ChatterStreamInput streamInput) { }
	global static void deleteComment(String communityId, String commentId) { }
	global static void deleteFeedElement(String communityId, String feedElementId) { }
	global static void deleteFeedItem(String communityId, String feedItemId) { }
	global static void deleteLike(String communityId, String likeId) { }
	global static void deleteStream(String communityId, String streamId) { }
	global static ConnectApi.Comment getComment(String communityId, String commentId) { }
	global static List<ConnectApi.BatchResult> getCommentBatch(String communityId, List<String> commentIds) { }
	global static ConnectApi.FeedElement getCommentInContext(String communityId, String commentId, Integer pageSize) { }
	global static ConnectApi.CommentPage getCommentsForFeedElement(String communityId, String feedElementId, String pageParam, Integer pageSize, Boolean threadedCommentsCollapsed, ConnectApi.FeedCommentSortOrder sortParam) { }
	global static ConnectApi.CommentPage getCommentsForFeedElement(String communityId, String feedElementId, String pageParam, Integer pageSize, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.CommentPage getCommentsForFeedElement(String communityId, String feedElementId, Boolean threadedCommentsCollapsed, ConnectApi.FeedCommentSortOrder sortParam) { }
	global static ConnectApi.CommentsCapability getCommentsForFeedElement(String communityId, String feedElementId, ConnectApi.FeedCommentSortOrder sortParam, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.CommentPage getCommentsForFeedElement(String communityId, String feedElementId, String pageParam, Integer pageSize) { }
	global static ConnectApi.CommentPage getCommentsForFeedElement(String communityId, String feedElementId, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.CommentsCapability getCommentsForFeedElement(String communityId, String feedElementId, ConnectApi.FeedCommentSortOrder sortParam) { }
	global static ConnectApi.CommentPage getCommentsForFeedElement(String communityId, String feedElementId) { }
	global static ConnectApi.CommentPage getCommentsForFeedItem(String communityId, String feedItemId, String pageParam, Integer pageSize) { }
	global static ConnectApi.CommentPage getCommentsForFeedItem(String communityId, String feedItemId) { }
	global static ConnectApi.ExtensionDefinitions getExtensions(String communityId, String pageParam, Integer pageSize) { }
	global static ConnectApi.Feed getFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.Feed getFeed(String communityId, ConnectApi.FeedType feedType, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.Feed getFeed(String communityId, ConnectApi.FeedType feedType, String subjectId) { }
	global static ConnectApi.Feed getFeed(String communityId, ConnectApi.FeedType feedType) { }
	global static ConnectApi.FeedDirectory getFeedDirectory(String communityId) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, Integer recentCommentCount, Integer elementsPerBundle, Boolean threadedCommentsCollapsed, ConnectApi.FeedCommentSortOrder commentSort) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, Integer recentCommentCount, Integer elementsPerBundle, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedCommentSortOrder commentSort) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, Boolean threadedCommentsCollapsed, ConnectApi.FeedCommentSortOrder commentSort) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, Integer recentCommentCount, Integer elementsPerBundle) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId, ConnectApi.FeedCommentSortOrder commentSort) { }
	global static ConnectApi.FeedElement getFeedElement(String communityId, String feedElementId) { }
	global static List<ConnectApi.BatchResult> getFeedElementBatch(String communityId, List<String> feedElementIds) { }
	global static ConnectApi.PollCapability getFeedElementPoll(String communityId, String feedElementId) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromBundle(String communityId, String feedElementId, String pageParam, Integer pageSize, Integer elementsPerBundle, Integer recentCommentCount) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromBundle(String communityId, String feedElementId) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedFilter filter, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, String customFilter, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, String customFilter) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String customFilter) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String customFilter) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFilterFeed(String communityId, String subjectId, String keyPrefix) { }
	global static ConnectApi.FeedElementPage getFeedElementsFromFilterFeedUpdatedSince(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, String customFilter) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, String customFilter) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, String customFilter) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince) { }
	global static ConnectApi.FeedElementPage getFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince) { }
	global static ConnectApi.FeedItem getFeedItem(String communityId, String feedItemId) { }
	global static List<ConnectApi.BatchResult> getFeedItemBatch(String communityId, List<String> feedItemIds) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFilterFeed(String communityId, String subjectId, String keyPrefix) { }
	global static ConnectApi.FeedItemPage getFeedItemsFromFilterFeedUpdatedSince(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince) { }
	global static ConnectApi.FeedItemPage getFeedItemsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly) { }
	global static ConnectApi.FeedItemPage getFeedItemsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince) { }
	global static ConnectApi.FeedItemPage getFeedItemsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince) { }
	global static ConnectApi.FeedPoll getFeedPoll(String communityId, String feedItemId) { }
	global static ConnectApi.Feed getFeedWithFeedElements(String communityId, ConnectApi.FeedType feedType, Integer pageSize, Integer recentCommentCount) { }
	global static ConnectApi.Feed getFeedWithFeedElements(String communityId, ConnectApi.FeedType feedType, Integer pageSize) { }
	global static ConnectApi.Feed getFilterFeed(String communityId, String subjectId, String keyPrefix, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.Feed getFilterFeed(String communityId, String subjectId, String keyPrefix) { }
	global static ConnectApi.FeedDirectory getFilterFeedDirectory(String communityId, String subjectId) { }
	global static ConnectApi.ChatterLike getLike(String communityId, String likeId) { }
	global static ConnectApi.ChatterLikePage getLikesForComment(String communityId, String commentId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterLikePage getLikesForComment(String communityId, String commentId) { }
	global static ConnectApi.ChatterLikePage getLikesForFeedElement(String communityId, String feedElementId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterLikePage getLikesForFeedElement(String communityId, String feedElementId) { }
	global static ConnectApi.ChatterLikePage getLikesForFeedItem(String communityId, String feedItemId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterLikePage getLikesForFeedItem(String communityId, String feedItemId) { }
	global static ConnectApi.LinkMetadataCollection getLinkMetadata(String communityId, String urls) { }
	global static ConnectApi.PinnedFeedElements getPinnedFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId) { }
	global static ConnectApi.ReadByPage getReadByForFeedElement(String communityId, String feedElementId, String pageParam, Integer pageSize) { }
	global static ConnectApi.ReadByPage getReadByForFeedElement(String communityId, String feedElementId) { }
	global static ConnectApi.RelatedFeedPosts getRelatedPosts(String communityId, String feedElementId, ConnectApi.RelatedFeedPostType filter, Integer maxResults) { }
	global static ConnectApi.ChatterStream getStream(String communityId, String streamId, Boolean globalScope) { }
	global static ConnectApi.ChatterStream getStream(String communityId, String streamId) { }
	global static ConnectApi.ChatterStreamPage getStreams(String communityId, Integer pageParam, Integer pageSize, ConnectApi.SortOrder sortParam, Boolean globalScope) { }
	global static ConnectApi.ChatterStreamPage getStreams(String communityId, Integer pageParam, Integer pageSize, ConnectApi.SortOrder sortParam) { }
	global static ConnectApi.ChatterStreamPage getStreams(String communityId, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterStreamPage getStreams(String communityId, ConnectApi.SortOrder sortParam) { }
	global static ConnectApi.ChatterStreamPage getStreams(String communityId) { }
	global static ConnectApi.SupportedEmojis getSupportedEmojis() { }
	global static ConnectApi.CommentPage getThreadsForFeedComment(String communityId, String commentId, String pageParam, Integer pageSize) { }
	global static ConnectApi.CommentsCapability getThreadsForFeedComment(String communityId, String commentId, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.CommentPage getThreadsForFeedComment(String communityId, String commentId) { }
	global static ConnectApi.FeedElementPage getTopUnansweredQuestions(String communityId, ConnectApi.FeedFilter filter, Integer pageSize) { }
	global static ConnectApi.FeedElementPage getTopUnansweredQuestions(String communityId, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage getTopUnansweredQuestions(String communityId, Integer pageSize) { }
	global static ConnectApi.FeedElementPage getTopUnansweredQuestions(String communityId) { }
	global static ConnectApi.VotePage getVotesForComment(String communityId, String commentId, ConnectApi.UpDownVoteValue vote, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.VotePage getVotesForComment(String communityId, String commentId, ConnectApi.UpDownVoteValue vote) { }
	global static ConnectApi.VotePage getVotesForFeedElement(String communityId, String feedElementId, ConnectApi.UpDownVoteValue vote, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.VotePage getVotesForFeedElement(String communityId, String feedElementId, ConnectApi.UpDownVoteValue vote) { }
	global static ConnectApi.FeedEntityIsEditable isCommentEditableByMe(String communityId, String commentId) { }
	global static ConnectApi.FeedEntityIsEditable isFeedElementEditableByMe(String communityId, String feedElementId) { }
	global static ConnectApi.FeedModifiedInfo isModified(String communityId, ConnectApi.FeedType feedType, String subjectId, String since) { }
	global static ConnectApi.ChatterLike likeComment(String communityId, String commentId) { }
	global static ConnectApi.ChatterLike likeFeedElement(String communityId, String feedElementId) { }
	global static ConnectApi.ChatterLike likeFeedItem(String communityId, String feedItemId) { }
	global static ConnectApi.Comment postComment(String communityId, String feedItemId, ConnectApi.CommentInput comment, ConnectApi.BinaryInput feedItemFileUpload) { }
	global static ConnectApi.Comment postComment(String communityId, String feedItemId, String text) { }
	global static ConnectApi.Comment postCommentToFeedElement(String communityId, String feedElementId, ConnectApi.CommentInput comment, ConnectApi.BinaryInput feedElementFileUpload) { }
	global static ConnectApi.Comment postCommentToFeedElement(String communityId, String feedElementId, String text) { }
	global static ConnectApi.FeedElement postFeedElement(String communityId, String subjectId, ConnectApi.FeedElementType feedElementType, String text) { }
	global static ConnectApi.FeedElement postFeedElement(String communityId, ConnectApi.FeedElementInput feedElement, ConnectApi.BinaryInput feedElementFileUpload) { }
	global static ConnectApi.FeedElement postFeedElement(String communityId, ConnectApi.FeedElementInput feedElement) { }
	global static List<ConnectApi.BatchResult> postFeedElementBatch(String communityId, List<ConnectApi.BatchInput> feedElements) { }
	global static ConnectApi.FeedItem postFeedItem(String communityId, ConnectApi.FeedType feedType, String subjectId, ConnectApi.FeedItemInput feedItem, ConnectApi.BinaryInput feedItemFileUpload) { }
	global static ConnectApi.FeedItem postFeedItem(String communityId, ConnectApi.FeedType feedType, String subjectId, String text) { }
	global static ConnectApi.FeedElement publishDraftFeedElement(String communityId, String feedElementId, ConnectApi.FeedElementInput feedElement) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q, Integer recentCommentCount, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q, String pageParam, Integer pageSize, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q, String pageParam, Integer pageSize) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q, Boolean threadedCommentsCollapsed) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedElementPage searchFeedElements(String communityId, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly, String customFilter) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, String customFilter) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedFilter filter) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, String customFilter) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedElementPage searchFeedElementsInFilterFeed(String communityId, String subjectId, String keyPrefix, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItems(String communityId, String q, Integer recentCommentCount, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage searchFeedItems(String communityId, String q, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage searchFeedItems(String communityId, String q, String pageParam, Integer pageSize) { }
	global static ConnectApi.FeedItemPage searchFeedItems(String communityId, String q, ConnectApi.FeedSortOrder sortParam) { }
	global static ConnectApi.FeedItemPage searchFeedItems(String communityId, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q) { }
	global static ConnectApi.FeedItemPage searchFeedItemsInFilterFeed(String communityId, String subjectId, String keyPrefix, String q) { }
	global static ConnectApi.ChatterStreamPage searchStreams(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.SortOrder sortParam, Boolean globalScope) { }
	global static ConnectApi.ChatterStreamPage searchStreams(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.SortOrder sortParam) { }
	global static ConnectApi.ChatterStreamPage searchStreams(String communityId, String q, Integer pageParam, Integer pageSize) { }
	global static ConnectApi.ChatterStreamPage searchStreams(String communityId, String q, ConnectApi.SortOrder sortParam) { }
	global static ConnectApi.ChatterStreamPage searchStreams(String communityId, String q) { }
	global static ConnectApi.VerifiedCapability setCommentIsVerified(String communityId, String commentId, Boolean isVerified) { }
	global static ConnectApi.VerifiedCapability setCommentIsVerifiedByAnonymized(String communityId, String commentId, Boolean isVerified, Boolean isVerifiedByAnonymized) { }
	global static ConnectApi.UpDownVoteCapability setCommentVote(String communityId, String commentId, ConnectApi.UpDownVoteCapabilityInput upDownVote) { }
	global static ConnectApi.StatusCapability setFeedCommentStatus(String communityId, String commentId, ConnectApi.StatusCapabilityInput status) { }
	global static ConnectApi.CloseCapability setFeedElementIsClosed(String communityId, String feedElementId, Boolean isClosed) { }
	global static ConnectApi.UpDownVoteCapability setFeedElementVote(String communityId, String feedElementId, ConnectApi.UpDownVoteCapabilityInput upDownVote) { }
	global static ConnectApi.StatusCapability setFeedEntityStatus(String communityId, String feedElementId, ConnectApi.StatusCapabilityInput status) { }
	global static ConnectApi.MuteCapability setIsMutedByMe(String communityId, String feedElementId, Boolean isMutedByMe) { }
	global static ConnectApi.ReadByCapability setIsReadByMe(String communityId, String feedElementId, Boolean isReadByMe) { }
	global static ConnectApi.ReadByCapability setIsReadByMe(String communityId, String feedElementId, ConnectApi.ReadByCapabilityInput readBy) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedFilter filter, Boolean threadedCommentsCollapsed, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, String customFilter, Boolean threadedCommentsCollapsed, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter, Boolean threadedCommentsCollapsed, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter, Boolean threadedCommentsCollapsed, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFeed(String communityId, ConnectApi.FeedType feedType, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFilterFeed(String communityId, String subjectId, String keyPrefix, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsFromFilterFeedUpdatedSince(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, Integer elementsPerBundle, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedElementsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedElementPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, Boolean showInternalOnly, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFeed(String communityId, ConnectApi.FeedType feedType, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFilterFeed(String communityId, String subjectId, String keyPrefix, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsFromFilterFeedUpdatedSince(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, Boolean showInternalOnly, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsUpdatedSince(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedItemPage result) { }
	global static void setTestGetFeedItemsUpdatedSince(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, String updatedSince, ConnectApi.FeedItemPage result) { }
	global static void setTestGetRelatedPosts(String communityId, String feedElementId, ConnectApi.RelatedFeedPostType filter, Integer maxResults, ConnectApi.RelatedFeedPosts result) { }
	global static void setTestGetTopUnansweredQuestions(String communityId, ConnectApi.FeedFilter filter, Integer pageSize, ConnectApi.FeedElementPage result) { }
	global static void setTestGetTopUnansweredQuestions(String communityId, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestGetTopUnansweredQuestions(String communityId, Integer pageSize, ConnectApi.FeedElementPage result) { }
	global static void setTestGetTopUnansweredQuestions(String communityId, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, Integer recentCommentCount, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, String pageParam, Integer pageSize, Boolean threadedCommentsCollapsed, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, String pageParam, Integer pageSize, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, Boolean threadedCommentsCollapsed, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElements(String communityId, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedFilter filter, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, String customFilter, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFeed(String communityId, ConnectApi.FeedType feedType, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedElementsInFilterFeed(String communityId, String subjectId, String keyPrefix, String q, ConnectApi.FeedElementPage result) { }
	global static void setTestSearchFeedItems(String communityId, String q, Integer recentCommentCount, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItems(String communityId, String q, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItems(String communityId, String q, String pageParam, Integer pageSize, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItems(String communityId, String q, ConnectApi.FeedSortOrder sortParam, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItems(String communityId, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, Boolean showInternalOnly, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String subjectId, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFeed(String communityId, ConnectApi.FeedType feedType, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFilterFeed(String communityId, String subjectId, String keyPrefix, Integer recentCommentCount, ConnectApi.FeedDensity density, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFilterFeed(String communityId, String subjectId, String keyPrefix, String pageParam, Integer pageSize, ConnectApi.FeedSortOrder sortParam, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchFeedItemsInFilterFeed(String communityId, String subjectId, String keyPrefix, String q, ConnectApi.FeedItemPage result) { }
	global static void setTestSearchStreams(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.SortOrder sortParam, Boolean globalScope, ConnectApi.ChatterStreamPage result) { }
	global static void setTestSearchStreams(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.SortOrder sortParam, ConnectApi.ChatterStreamPage result) { }
	global static void setTestSearchStreams(String communityId, String q, Integer pageParam, Integer pageSize, ConnectApi.ChatterStreamPage result) { }
	global static void setTestSearchStreams(String communityId, String q, ConnectApi.SortOrder sortParam, ConnectApi.ChatterStreamPage result) { }
	global static void setTestSearchStreams(String communityId, String q, ConnectApi.ChatterStreamPage result) { }
	global static ConnectApi.FeedElement shareFeedElement(String communityId, String subjectId, ConnectApi.FeedElementType feedElementType, String originalFeedElementId) { }
	global static ConnectApi.FeedItem shareFeedItem(String communityId, ConnectApi.FeedType feedType, String subjectId, String originalFeedItemId) { }
	global static ConnectApi.FeedItem updateBookmark(String communityId, String feedItemId, Boolean isBookmarkedByCurrentUser) { }
	global static ConnectApi.Comment updateComment(String communityId, String commentId, ConnectApi.CommentInput comment) { }
	global static ConnectApi.DirectMessageCapability updateDirectMessage(String communityId, String feedElementId, ConnectApi.DirectMessageCapabilityInput directMessage) { }
	global static ConnectApi.FeedElement updateFeedElement(String communityId, String feedElementId, ConnectApi.FeedElementInput feedElement) { }
	global static ConnectApi.BookmarksCapability updateFeedElementBookmarks(String communityId, String feedElementId, Boolean isBookmarkedByCurrentUser) { }
	global static ConnectApi.BookmarksCapability updateFeedElementBookmarks(String communityId, String feedElementId, ConnectApi.BookmarksCapabilityInput bookmarks) { }
	global static List<ConnectApi.BatchResult> updateFeedElementReadByCapabilityBatch(String communityId, List<String> feedElementIds, Boolean isReadByMe) { }
	global static List<ConnectApi.BatchResult> updateFeedElementReadByCapabilityBatch(String communityId, List<String> feedElementIds, ConnectApi.ReadByCapabilityInput readBy) { }
	global static ConnectApi.ChatterLikePage updateLikeForComment(String communityId, String commentId, Boolean isLikedByCurrentUser) { }
	global static ConnectApi.ChatterLikePage updateLikeForFeedElement(String communityId, String feedElementId, Boolean isLikedByCurrentUser) { }
	global static ConnectApi.PinCapability updatePinnedFeedElements(String communityId, ConnectApi.FeedType feedType, String subjectId, ConnectApi.PinCapabilityInput pin) { }
	global static ConnectApi.ChatterStream updateStream(String communityId, String streamId, ConnectApi.ChatterStreamInput streamInput) { }
	global static ConnectApi.PollCapability voteOnFeedElementPoll(String communityId, String feedElementId, String myChoiceId) { }
	global static ConnectApi.FeedPoll voteOnFeedPoll(String communityId, String feedItemId, String myChoiceId) { }

}