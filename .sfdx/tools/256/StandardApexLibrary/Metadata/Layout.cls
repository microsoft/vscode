global class Layout {
	global List<String> customButtons;
	global Metadata.CustomConsoleComponents customConsoleComponents;
	global Boolean emailDefault;
	global List<String> excludeButtons;
	global Metadata.FeedLayout feedLayout;
	global List<Metadata.LayoutHeader> headers;
	global List<Metadata.LayoutSection> layoutSections;
	global Metadata.MiniLayout miniLayout;
	global List<String> multilineLayoutFields;
	global Metadata.PlatformActionList platformActionList;
	global Metadata.QuickActionList quickActionList;
	global Metadata.RelatedContent relatedContent;
	global List<Metadata.RelatedListItem> relatedLists;
	global List<String> relatedObjects;
	global Boolean runAssignmentRulesDefault;
	global Boolean showEmailCheckbox;
	global Boolean showHighlightsPanel;
	global Boolean showInteractionLogPanel;
	global Boolean showKnowledgeComponent;
	global Boolean showRunAssignmentRulesCheckbox;
	global Boolean showSolutionSection;
	global Boolean showSubmitAndAttachButton;
	global Metadata.SummaryLayout summaryLayout;
	global Layout() { }
	global Object clone() { }

}