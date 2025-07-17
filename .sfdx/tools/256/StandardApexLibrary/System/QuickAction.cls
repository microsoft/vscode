global class QuickAction {
	/**
	 * Returns the meta information for the available quick actions of the provided parent object
	 */
	global static List<QuickAction.DescribeAvailableQuickActionResult> describeAvailableQuickActions(String parentType) { }
	/**
	 * Returns the meta information for the quick action of the provided app object
	 */
	global static List<QuickAction.DescribeQuickActionResult> describeQuickActions(List<String> actions) { }
	/**
	 * Perform a QuickAction, optionally choosing to leave any successes in the current transaction
	 */
	global static QuickAction.QuickActionResult performQuickAction(QuickAction.QuickActionRequest performQuickAction, Boolean allOrNothing) { }
	/**
	 * Perform a QuickAction
	 */
	global static QuickAction.QuickActionResult performQuickAction(QuickAction.QuickActionRequest performQuickAction) { }
	/**
	 * Perform QuickActions, optionally choosing to leave any successes in the current transaction
	 */
	global static List<QuickAction.QuickActionResult> performQuickActions(List<QuickAction.QuickActionRequest> performQuickActions, Boolean allOrNothing) { }
	/**
	 * Perform QuickActions
	 */
	global static List<QuickAction.QuickActionResult> performQuickActions(List<QuickAction.QuickActionRequest> performQuickActions) { }
	/**
	 * Retrieve a QuickAction template for a given id
	 */
	global static QuickAction.QuickActionTemplateResult retrieveQuickActionTemplate(String quickActionName, Id contextId) { }
	/**
	 * Retrieve QuickAction templates for a given id
	 */
	global static List<QuickAction.QuickActionTemplateResult> retrieveQuickActionTemplates(List<String> quickActionNames, Id contextId) { }

}