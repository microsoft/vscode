global class FeedLayout {
	global Boolean autocollapsePublisher;
	global Boolean compactFeed;
	global Metadata.FeedLayoutFilterPosition feedFilterPosition;
	global List<Metadata.FeedLayoutFilter> feedFilters;
	global Boolean fullWidthFeed;
	global Boolean hideSidebar;
	global Boolean highlightExternalFeedItems;
	global List<Metadata.FeedLayoutComponent> leftComponents;
	global List<Metadata.FeedLayoutComponent> rightComponents;
	global Boolean useInlineFiltersInConsole;
	global FeedLayout() { }
	global Object clone() { }

}