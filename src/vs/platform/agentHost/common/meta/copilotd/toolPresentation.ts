/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownInlineCode } from '../../../../../base/common/htmlContent.js';
import { isString } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { parsePartialToolInputForDisplay } from '../../partialToolInput.js';
import { getInlineToolInput } from '../../state/sessionState.js';
import { ToolCallStatus, type StringOrMarkdown, type ToolCallState } from '../../state/protocol/state.js';

export interface IToolPresentation {
	readonly toolKind?: 'terminal' | 'search' | 'read';
	readonly invocationMessage: StringOrMarkdown;
	readonly pastTenseMessage: StringOrMarkdown;
}

interface IToolLabels {
	readonly running: string;
	readonly completed: string;
	readonly failed: string;
	readonly kind?: IToolPresentation['toolKind'];
	readonly subjectKeys?: readonly string[];
}

const aliases: Readonly<Record<string, string>> = {
	powershell: 'bash', local_shell: 'bash',
	read: 'view', read_file: 'view',
	rg: 'search', grep: 'search', glob: 'search',
	str_replace_editor: 'edit', str_replace: 'edit', insert: 'edit',
	create: 'write_file', write: 'write_file',
	get_pr_overview: 'get_changes_overview',
	todowrite: 'update_todo', reply_to_comment: 'annotate_diff_line',
	send_workspace_message: 'send_session_message', send_chat_message: 'send_session_message',
	run_factory: 'run_dynamic_workflow', factories_manage: 'dynamic_workflows_manage',
	session_store_sql: 'sql',
	create_workspace: 'create_session', get_workspace: 'get_session',
	list_workspaces_and_chats: 'list_sessions_and_chats',
	open_pr_workspace: 'open_pr_session', open_issue_workspace: 'open_issue_session',
	bash_shutdown: 'stop_bash', powershell_shutdown: 'stop_bash',
	read_powershell: 'read_bash', write_powershell: 'write_bash',
	stop_powershell: 'stop_bash', list_powershell: 'list_bash',
};

// Temporary app-compatible display fallback until hosts advertise tool presentation kinds.
const labels: Readonly<Record<string, IToolLabels>> = {
	search: { kind: 'search', subjectKeys: ['pattern', 'query'], running: localize('copilotd.search.running', "Searching"), completed: localize('copilotd.search.completed', "Searched"), failed: localize('copilotd.search.failed', "Search failed") },
	view: { kind: 'read', subjectKeys: ['file_path', 'path'], running: localize('copilotd.read.running', "Reading"), completed: localize('copilotd.read.completed', "Read"), failed: localize('copilotd.read.failed', "Read failed") },
	show_file: { subjectKeys: ['file_path', 'path'], running: localize('copilotd.showFile.running', "Showing file"), completed: localize('copilotd.showFile.completed', "Showed file"), failed: localize('copilotd.showFile.failed', "Show file failed") },
	edit: { subjectKeys: ['file_path', 'path'], running: localize('copilotd.edit.running', "Editing"), completed: localize('copilotd.edit.completed', "Edited"), failed: localize('copilotd.edit.failed', "Edit failed") },
	write_file: { subjectKeys: ['file_path', 'path'], running: localize('copilotd.write.running', "Creating file"), completed: localize('copilotd.write.completed', "Created file"), failed: localize('copilotd.write.failed', "Create file failed") },
	apply_patch: { running: localize('copilotd.patch.running', "Applying patch"), completed: localize('copilotd.patch.completed', "Applied patch"), failed: localize('copilotd.patch.failed', "Apply patch failed") },
	bash: { kind: 'terminal', subjectKeys: ['description', 'command'], running: localize('copilotd.shell.running', "Running command"), completed: localize('copilotd.shell.completed', "Ran command"), failed: localize('copilotd.shell.failed', "Command failed") },
	read_bash: { running: localize('copilotd.readShell.running', "Reading shell output"), completed: localize('copilotd.readShell.completed', "Read shell output"), failed: localize('copilotd.readShell.failed', "Read shell output failed") },
	write_bash: { running: localize('copilotd.writeShell.running', "Sending input to shell"), completed: localize('copilotd.writeShell.completed', "Sent input to shell"), failed: localize('copilotd.writeShell.failed', "Send input to shell failed") },
	stop_bash: { running: localize('copilotd.stopShell.running', "Stopping shell"), completed: localize('copilotd.stopShell.completed', "Stopped shell"), failed: localize('copilotd.stopShell.failed', "Stop shell failed") },
	list_bash: { running: localize('copilotd.listShell.running', "Listing shell sessions"), completed: localize('copilotd.listShell.completed', "Listed shell sessions"), failed: localize('copilotd.listShell.failed', "List shell sessions failed") },
	task: { subjectKeys: ['description', 'agent_type'], running: localize('copilotd.task.running', "Delegating task"), completed: localize('copilotd.task.completed', "Delegated task"), failed: localize('copilotd.task.failed', "Task failed") },
	read_agent: { subjectKeys: ['agent_id', 'agentId'], running: localize('copilotd.readAgent.running', "Reading agent activity"), completed: localize('copilotd.readAgent.completed', "Read agent activity"), failed: localize('copilotd.readAgent.failed', "Read agent activity failed") },
	write_agent: { running: localize('copilotd.writeAgent.running', "Sending message to agent"), completed: localize('copilotd.writeAgent.completed', "Sent message to agent"), failed: localize('copilotd.writeAgent.failed', "Send message to agent failed") },
	task_complete: { running: localize('copilotd.taskComplete.running', "Marking task complete"), completed: localize('copilotd.taskComplete.completed', "Task complete"), failed: localize('copilotd.taskComplete.failed', "Task completion failed") },
	ask_user: { subjectKeys: ['question'], running: localize('copilotd.ask.running', "Asking a question"), completed: localize('copilotd.ask.completed', "Asked a question"), failed: localize('copilotd.ask.failed', "Ask question failed") },
	exit_plan_mode: { running: localize('copilotd.plan.running', "Finishing plan"), completed: localize('copilotd.plan.completed', "Finished plan"), failed: localize('copilotd.plan.failed', "Finish plan failed") },
	respond_to_session_plan: { running: localize('copilotd.respondPlan.running', "Responding to plan"), completed: localize('copilotd.respondPlan.completed', "Responded to plan"), failed: localize('copilotd.respondPlan.failed', "Respond to plan failed") },
	skill: { subjectKeys: ['skill', 'name'], running: localize('copilotd.skill.running', "Reading skill"), completed: localize('copilotd.skill.completed', "Read skill"), failed: localize('copilotd.skill.failed', "Read skill failed") },
	web_search: { subjectKeys: ['query'], running: localize('copilotd.webSearch.running', "Searching the web"), completed: localize('copilotd.webSearch.completed', "Searched the web"), failed: localize('copilotd.webSearch.failed', "Web search failed") },
	web_fetch: { subjectKeys: ['url'], running: localize('copilotd.webFetch.running', "Fetching webpage"), completed: localize('copilotd.webFetch.completed', "Fetched webpage"), failed: localize('copilotd.webFetch.failed', "Fetch webpage failed") },
	sql: { subjectKeys: ['description'], running: localize('copilotd.sql.running', "Running SQL"), completed: localize('copilotd.sql.completed', "Ran SQL"), failed: localize('copilotd.sql.failed', "SQL failed") },
	tool_search_tool_regex: { subjectKeys: ['regex', 'pattern'], running: localize('copilotd.toolSearch.running', "Searching tools"), completed: localize('copilotd.toolSearch.completed', "Searched tools"), failed: localize('copilotd.toolSearch.failed', "Tool search failed") },
	update_todo: { running: localize('copilotd.todo.running', "Updating todo list"), completed: localize('copilotd.todo.completed', "Updated todo list"), failed: localize('copilotd.todo.failed', "Update todo list failed") },
	update_profile: { running: localize('copilotd.profile.running', "Updating profile"), completed: localize('copilotd.profile.completed', "Updated profile"), failed: localize('copilotd.profile.failed', "Update profile failed") },
	store_memory: { subjectKeys: ['fact'], running: localize('copilotd.memory.running', "Saving memory"), completed: localize('copilotd.memory.completed', "Saved memory"), failed: localize('copilotd.memory.failed', "Save memory failed") },
	create_pull_request: { subjectKeys: ['title'], running: localize('copilotd.createPr.running', "Creating pull request"), completed: localize('copilotd.createPr.completed', "Created pull request"), failed: localize('copilotd.createPr.failed', "Create pull request failed") },
	create_issue: { subjectKeys: ['title'], running: localize('copilotd.createIssue.running', "Creating issue"), completed: localize('copilotd.createIssue.completed', "Created issue"), failed: localize('copilotd.createIssue.failed', "Create issue failed") },
	create_session: { subjectKeys: ['name'], running: localize('copilotd.createSession.running', "Creating session"), completed: localize('copilotd.createSession.completed', "Created session"), failed: localize('copilotd.createSession.failed', "Create session failed") },
	get_changes_overview: { running: localize('copilotd.changes.running', "Reviewing changes"), completed: localize('copilotd.changes.completed', "Reviewed changes"), failed: localize('copilotd.changes.failed', "Review changes failed") },
	send_session_message: { running: localize('copilotd.sendSession.running', "Sending session message"), completed: localize('copilotd.sendSession.completed', "Sent session message"), failed: localize('copilotd.sendSession.failed', "Send session message failed") },
	annotate_diff_line: { subjectKeys: ['path'], running: localize('copilotd.annotate.running', "Adding review comment"), completed: localize('copilotd.annotate.completed', "Added review comment"), failed: localize('copilotd.annotate.failed', "Add review comment failed") },
	add_pr_review_comment: { running: localize('copilotd.prComment.running', "Adding PR review comment"), completed: localize('copilotd.prComment.completed', "Added PR review comment"), failed: localize('copilotd.prComment.failed', "Add PR review comment failed") },
	edit_pr_review_comment: { running: localize('copilotd.editComment.running', "Editing PR review comment"), completed: localize('copilotd.editComment.completed', "Edited PR review comment"), failed: localize('copilotd.editComment.failed', "Edit PR review comment failed") },
	remove_pr_review_comment: { running: localize('copilotd.removeComment.running', "Removing PR review comment"), completed: localize('copilotd.removeComment.completed', "Removed PR review comment"), failed: localize('copilotd.removeComment.failed', "Remove PR review comment failed") },
	reply_and_resolve_review_thread: { running: localize('copilotd.resolveThread.running', "Replying and resolving review thread"), completed: localize('copilotd.resolveThread.completed', "Replied and resolved review thread"), failed: localize('copilotd.resolveThread.failed', "Resolve review thread failed") },
	navigate_to: { running: localize('copilotd.navigate.running', "Navigating"), completed: localize('copilotd.navigate.completed', "Navigated"), failed: localize('copilotd.navigate.failed', "Navigation failed") },
	navigate_to_github_item: { running: localize('copilotd.githubItem.running', "Opening GitHub item"), completed: localize('copilotd.githubItem.completed', "Opened GitHub item"), failed: localize('copilotd.githubItem.failed', "Open GitHub item failed") },
	open_pr_session: { running: localize('copilotd.openPr.running', "Opening PR session"), completed: localize('copilotd.openPr.completed', "Opened PR session"), failed: localize('copilotd.openPr.failed', "Open PR session failed") },
	open_issue_session: { running: localize('copilotd.openIssue.running', "Opening issue session"), completed: localize('copilotd.openIssue.completed', "Opened issue session"), failed: localize('copilotd.openIssue.failed', "Open issue session failed") },
	list_agents: { running: localize('copilotd.listAgents.running', "Listing agents"), completed: localize('copilotd.listAgents.completed', "Listed agents"), failed: localize('copilotd.listAgents.failed', "List agents failed") },
	list_sessions_and_chats: { running: localize('copilotd.listSessions.running', "Listing sessions"), completed: localize('copilotd.listSessions.completed', "Listed sessions"), failed: localize('copilotd.listSessions.failed', "List sessions failed") },
	list_items: { running: localize('copilotd.listItems.running', "Listing items"), completed: localize('copilotd.listItems.completed', "Listed items"), failed: localize('copilotd.listItems.failed', "List items failed") },
	list_projects: { running: localize('copilotd.listProjects.running', "Listing projects"), completed: localize('copilotd.listProjects.completed', "Listed projects"), failed: localize('copilotd.listProjects.failed', "List projects failed") },
	get_session: { running: localize('copilotd.getSession.running', "Looking up session"), completed: localize('copilotd.getSession.completed', "Looked up session"), failed: localize('copilotd.getSession.failed', "Look up session failed") },
	get_sessions_status: { running: localize('copilotd.sessionStatus.running', "Checking session status"), completed: localize('copilotd.sessionStatus.completed', "Checked session status"), failed: localize('copilotd.sessionStatus.failed', "Check session status failed") },
	get_main_session_transcript: { running: localize('copilotd.transcript.running', "Reading session transcript"), completed: localize('copilotd.transcript.completed', "Read session transcript"), failed: localize('copilotd.transcript.failed', "Read session transcript failed") },
	rename_session: { subjectKeys: ['title'], running: localize('copilotd.renameSession.running', "Renaming session"), completed: localize('copilotd.renameSession.completed', "Renamed session"), failed: localize('copilotd.renameSession.failed', "Rename session failed") },
	rename_workspace: { subjectKeys: ['title'], running: localize('copilotd.renameWorkspace.running', "Renaming session"), completed: localize('copilotd.renameWorkspace.completed', "Renamed session"), failed: localize('copilotd.renameWorkspace.failed', "Rename session failed") },
	rename_branch: { subjectKeys: ['name'], running: localize('copilotd.renameBranch.running', "Renaming branch"), completed: localize('copilotd.renameBranch.completed', "Renamed branch"), failed: localize('copilotd.renameBranch.failed', "Rename branch failed") },
	delete_item: { running: localize('copilotd.delete.running', "Deleting item"), completed: localize('copilotd.delete.completed', "Deleted item"), failed: localize('copilotd.delete.failed', "Delete item failed") },
	archive_session: { running: localize('copilotd.archive.running', "Archiving session"), completed: localize('copilotd.archive.completed', "Archived session"), failed: localize('copilotd.archive.failed', "Archive session failed") },
	suggest_items: { running: localize('copilotd.suggest.running', "Suggesting items"), completed: localize('copilotd.suggest.completed', "Suggested items"), failed: localize('copilotd.suggest.failed', "Suggest items failed") },
	get_session_automation: { running: localize('copilotd.getSchedule.running', "Looking up schedule"), completed: localize('copilotd.getSchedule.completed', "Looked up schedule"), failed: localize('copilotd.getSchedule.failed', "Look up schedule failed") },
	save_session_automation: { running: localize('copilotd.saveSchedule.running', "Saving schedule"), completed: localize('copilotd.saveSchedule.completed', "Saved schedule"), failed: localize('copilotd.saveSchedule.failed', "Save schedule failed") },
	list_workflows: { running: localize('copilotd.listWorkflows.running', "Listing automations"), completed: localize('copilotd.listWorkflows.completed', "Listed automations"), failed: localize('copilotd.listWorkflows.failed', "List automations failed") },
	save_workflow: { subjectKeys: ['name'], running: localize('copilotd.saveWorkflow.running', "Saving automation"), completed: localize('copilotd.saveWorkflow.completed', "Saved automation"), failed: localize('copilotd.saveWorkflow.failed', "Save automation failed") },
	run_workflow: { running: localize('copilotd.runWorkflow.running', "Running automation"), completed: localize('copilotd.runWorkflow.completed', "Ran automation"), failed: localize('copilotd.runWorkflow.failed', "Run automation failed") },
	run_dynamic_workflow: { running: localize('copilotd.runDynamic.running', "Running workflow"), completed: localize('copilotd.runDynamic.completed', "Ran workflow"), failed: localize('copilotd.runDynamic.failed', "Workflow failed") },
	dynamic_workflows_manage: { running: localize('copilotd.manageDynamic.running', "Managing workflows"), completed: localize('copilotd.manageDynamic.completed', "Managed workflows"), failed: localize('copilotd.manageDynamic.failed', "Manage workflows failed") },
	open_canvas: { subjectKeys: ['title', 'name', 'url'], running: localize('copilotd.canvas.running', "Opening canvas"), completed: localize('copilotd.canvas.completed', "Opened canvas"), failed: localize('copilotd.canvas.failed', "Open canvas failed") },
	send_canvas_command: { subjectKeys: ['name', 'command'], running: localize('copilotd.canvasCommand.running', "Sending canvas command"), completed: localize('copilotd.canvasCommand.completed', "Sent canvas command"), failed: localize('copilotd.canvasCommand.failed', "Send canvas command failed") },
	clear_widget: { running: localize('copilotd.clearWidget.running', "Clearing widget"), completed: localize('copilotd.clearWidget.completed', "Cleared widget"), failed: localize('copilotd.clearWidget.failed', "Clear widget failed") },
	discover_widgets: { running: localize('copilotd.widgets.running', "Discovering widgets"), completed: localize('copilotd.widgets.completed', "Discovered widgets"), failed: localize('copilotd.widgets.failed', "Discover widgets failed") },
	render_widget: { running: localize('copilotd.renderWidget.running', "Rendering widget"), completed: localize('copilotd.renderWidget.completed', "Rendered widget"), failed: localize('copilotd.renderWidget.failed', "Render widget failed") },
	render_widget_inbox: { running: localize('copilotd.renderInbox.running', "Rendering inbox"), completed: localize('copilotd.renderInbox.completed', "Rendered inbox"), failed: localize('copilotd.renderInbox.failed', "Render inbox failed") },
	list_priorities: { running: localize('copilotd.priorities.running', "Reviewing priorities"), completed: localize('copilotd.priorities.completed', "Reviewed priorities"), failed: localize('copilotd.priorities.failed', "Review priorities failed") },
	get_priority: { running: localize('copilotd.priority.running', "Reading priority"), completed: localize('copilotd.priority.completed', "Read priority"), failed: localize('copilotd.priority.failed', "Read priority failed") },
	save_priority: { subjectKeys: ['title'], running: localize('copilotd.savePriority.running', "Updating priority"), completed: localize('copilotd.savePriority.completed', "Updated priority"), failed: localize('copilotd.savePriority.failed', "Update priority failed") },
	reorder_priorities: { running: localize('copilotd.reorderPriorities.running', "Reordering priorities"), completed: localize('copilotd.reorderPriorities.completed', "Reordered priorities"), failed: localize('copilotd.reorderPriorities.failed', "Reorder priorities failed") },
	archive_priority: { running: localize('copilotd.archivePriority.running', "Removing priority"), completed: localize('copilotd.archivePriority.completed', "Removed priority"), failed: localize('copilotd.archivePriority.failed', "Remove priority failed") },
	list_scheduled_tasks: { running: localize('copilotd.schedules.running', "Reviewing scheduled tasks"), completed: localize('copilotd.schedules.completed', "Reviewed scheduled tasks"), failed: localize('copilotd.schedules.failed', "Review scheduled tasks failed") },
	get_scheduled_task: { running: localize('copilotd.getScheduled.running', "Reading scheduled task"), completed: localize('copilotd.getScheduled.completed', "Read scheduled task"), failed: localize('copilotd.getScheduled.failed', "Read scheduled task failed") },
	save_scheduled_task: { subjectKeys: ['title'], running: localize('copilotd.saveScheduled.running', "Updating scheduled task"), completed: localize('copilotd.saveScheduled.completed', "Updated scheduled task"), failed: localize('copilotd.saveScheduled.failed', "Update scheduled task failed") },
	delete_scheduled_task: { running: localize('copilotd.deleteScheduled.running', "Deleting scheduled task"), completed: localize('copilotd.deleteScheduled.completed', "Deleted scheduled task"), failed: localize('copilotd.deleteScheduled.failed', "Delete scheduled task failed") },
	run_scheduled_task: { running: localize('copilotd.runScheduled.running', "Starting scheduled task"), completed: localize('copilotd.runScheduled.completed', "Started scheduled task"), failed: localize('copilotd.runScheduled.failed', "Start scheduled task failed") },
};

export function readCopilotToolPresentation(call: ToolCallState): IToolPresentation | undefined {
	if (call.contributor || call._meta?.ui !== undefined) {
		return undefined;
	}
	const rawName = call.toolName.trim().toLowerCase();
	let name = Object.hasOwn(aliases, rawName) ? aliases[rawName] : rawName;
	const codeSearch = (name === 'lexical_code_search' || name === 'semantic_code_search') && call.displayName === 'GitHub Code Search';
	if (!codeSearch && !Object.hasOwn(labels, name)) {
		return undefined;
	}
	const input = call.status === ToolCallStatus.Streaming ? call.partialInput : getInlineToolInput(call.toolInput);
	const args = input ? parsePartialToolInputForDisplay(input) : undefined;
	if (rawName === 'str_replace_editor' && args?.command === 'view') {
		name = 'view';
	}
	const description = codeSearch ? labels.search : Object.hasOwn(labels, name) ? labels[name] : undefined;
	if (!description) {
		return undefined;
	}
	const subject = (codeSearch ? ['query'] : description.subjectKeys)?.map(key => args?.[key]).find(value => isString(value) && value.trim().length > 0);
	const format = (label: string): StringOrMarkdown => {
		if (!isString(subject)) {
			return label;
		}
		const text = subject.trim();
		const bounded = text.length > 80 ? `${text.slice(0, 80)}...` : text;
		return { markdown: localize('copilotd.tool.subject', "{0} {1}", label, appendEscapedMarkdownInlineCode(bounded)) };
	};
	return {
		toolKind: description.kind === 'terminal' && (!isString(args?.command) || !args.command.trim()) ? undefined : description.kind,
		invocationMessage: format(description.running),
		pastTenseMessage: format(call.status === ToolCallStatus.Completed && !call.success ? description.failed : description.completed),
	};
}
