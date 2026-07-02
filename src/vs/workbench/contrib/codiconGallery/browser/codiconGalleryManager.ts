/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon, getAllCodicons } from '../../../../base/common/codicons.js';
import { getCodiconFontCharacters } from '../../../../base/common/codiconsUtil.js';
import { FileAccess } from '../../../../base/common/network.js';
import { escape } from '../../../../base/common/strings.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';

interface ICodiconEntry {
	readonly id: string;
	readonly description: string;
	readonly glyph: string;
}

interface ICopyClassMessage {
	readonly type: 'copyClass';
	readonly iconId: string;
	readonly value: string;
}

const exactDescriptions = new Map<string, string>([
	['account', 'Account or user profile'],
	['activate-breakpoints', 'Activate all breakpoints'],
	['add', 'Add or create a new item'],
	['add-small', 'Small add icon'],
	['agent', 'AI coding agent'],
	['alert', 'Warning or alert'],
	['archive', 'Archive'],
	['arrow-both', 'Arrow pointing in both directions'],
	['ask', 'Ask a question in AI chat'],
	['attach', 'Attach a file or resource'],
	['azure', 'Microsoft Azure'],
	['azure-devops', 'Azure DevOps'],
	['beaker', 'Test or experiment'],
	['bell', 'Notification bell'],
	['bell-dot', 'Bell with unread notification dot'],
	['bell-slash', 'Notifications silenced'],
	['bell-slash-dot', 'Silenced notifications with unread dot'],
	['blank', 'Blank or empty placeholder'],
	['book', 'Book or documentation'],
	['bookmark', 'Bookmark'],
	['broadcast', 'Broadcast or Live Share session'],
	['bug', 'Bug or debug issue'],
	['calendar', 'Calendar or date'],
	['case-sensitive', 'Toggle case-sensitive matching'],
	['check', 'Checkmark'],
	['check-all', 'Check all or select all'],
	['checklist', 'Checklist'],
	['chip', 'Microchip or hardware component'],
	['circle-filled', 'Solid filled circle'],
	['circle-large', 'Large circle outline'],
	['circle-large-filled', 'Large solid circle'],
	['circle-slash', 'Circle with slash for blocked or disabled'],
	['circle-small', 'Small circle'],
	['circle-small-filled', 'Small solid circle'],
	['clear-all', 'Clear all items'],
	['claude', 'Anthropic Claude logo'],
	['close', 'Close or dismiss'],
	['close-all', 'Close all open editors'],
	['cloud', 'Cloud service'],
	['cloud-download', 'Download from the cloud'],
	['cloud-upload', 'Upload to the cloud'],
	['code', 'Code snippet or source code'],
	['code-review', 'Code review'],
	['code-oss', 'Code - OSS logo'],
	['coffee', 'Coffee or a short break'],
	['collapse-all', 'Collapse all tree nodes'],
	['collection', 'Collection of items'],
	['collection-small', 'Small collection icon'],
	['comment-discussion-sparkle', 'AI-enhanced discussion'],
	['comment-discussion', 'Comment discussion thread'],
	['compass', 'Compass or navigation'],
	['compass-active', 'Active compass navigation'],
	['compass-dot', 'Compass with activity dot'],
	['copy', 'Copy to the clipboard'],
	['copilot', 'GitHub Copilot'],
	['copilot-blocked', 'Copilot is blocked by policy'],
	['copilot-error', 'Copilot error state'],
	['copilot-in-progress', 'Copilot is working'],
	['copilot-large', 'Large Copilot icon'],
	['copilot-not-connected', 'Copilot is not connected'],
	['copilot-snooze', 'Copilot is snoozed'],
	['copilot-success', 'Copilot success state'],
	['copilot-unavailable', 'Copilot is unavailable'],
	['copilot-warning', 'Copilot warning state'],
	['copilot-warning-large', 'Large Copilot warning state'],
	['coverage', 'Code coverage report'],
	['credit-card', 'Credit card or billing'],
	['dash', 'Dash or minus sign'],
	['dashboard', 'Dashboard or overview'],
	['database', 'Database'],
	['debug', 'Start or open the debugger'],
	['debug-all', 'Debug all configurations'],
	['debug-alt', 'Alternate debugger icon'],
	['debug-alt-small', 'Small alternate debugger icon'],
	['debug-breakpoint', 'Active breakpoint'],
	['debug-breakpoint-conditional', 'Conditional breakpoint'],
	['debug-breakpoint-conditional-disabled', 'Disabled conditional breakpoint'],
	['debug-breakpoint-conditional-unverified', 'Unverified conditional breakpoint'],
	['debug-breakpoint-data', 'Data or watchpoint breakpoint'],
	['debug-breakpoint-data-disabled', 'Disabled data breakpoint'],
	['debug-breakpoint-data-unverified', 'Unverified data breakpoint'],
	['debug-breakpoint-disabled', 'Disabled breakpoint'],
	['debug-breakpoint-function', 'Function breakpoint'],
	['debug-breakpoint-function-disabled', 'Disabled function breakpoint'],
	['debug-breakpoint-function-unverified', 'Unverified function breakpoint'],
	['debug-breakpoint-log', 'Logpoint breakpoint'],
	['debug-breakpoint-log-disabled', 'Disabled logpoint'],
	['debug-breakpoint-log-unverified', 'Unverified logpoint'],
	['debug-breakpoint-pending', 'Pending breakpoint'],
	['debug-breakpoint-unverified', 'Unverified breakpoint'],
	['debug-breakpoint-unsupported', 'Unsupported breakpoint'],
	['debug-console', 'Open the debug console'],
	['debug-continue', 'Continue or resume execution'],
	['debug-continue-small', 'Small continue button'],
	['debug-coverage', 'Run a debug session with code coverage'],
	['debug-disconnect', 'Disconnect from the debug session'],
	['debug-hint', 'Debug hint indicator'],
	['debug-line-by-line', 'Enable line-by-line stepping'],
	['debug-pause', 'Pause execution'],
	['debug-rerun', 'Rerun the current debug session'],
	['debug-restart', 'Restart the current debug session'],
	['debug-restart-frame', 'Restart the current stack frame'],
	['debug-reverse-continue', 'Reverse-continue to the previous breakpoint'],
	['debug-stackframe', 'Current debug stack frame'],
	['debug-stackframe-active', 'Active top debug stack frame'],
	['debug-stackframe-dot', 'Stack frame dot indicator'],
	['debug-stackframe-focused', 'Focused debug stack frame'],
	['debug-start', 'Start a new debug session'],
	['debug-step-back', 'Step back to the previous line'],
	['debug-step-into', 'Step into the current function'],
	['debug-step-out', 'Step out of the current function'],
	['debug-step-over', 'Step over the current line'],
	['debug-stop', 'Stop the current debug session'],
	['device-camera', 'Camera device'],
	['device-camera-video', 'Video camera device'],
	['device-desktop', 'Desktop computer or virtual machine'],
	['device-mobile', 'Mobile device'],
	['dialog-close', 'Close dialog button'],
	['dialog-error', 'Error dialog'],
	['dialog-info', 'Information dialog'],
	['dialog-warning', 'Warning dialog'],
	['diff', 'Side-by-side diff view'],
	['diff-added', 'Diff added line'],
	['diff-ignored', 'Diff ignored or untracked file'],
	['diff-modified', 'Diff modified line'],
	['diff-multiple', 'Multi-file diff view'],
	['diff-removed', 'Diff removed line'],
	['diff-renamed', 'Diff renamed file'],
	['diff-sidebyside', 'Side-by-side diff view'],
	['diff-single', 'Single-file diff view'],
	['discard', 'Discard unsaved changes'],
	['edit', 'Edit in place'],
	['edit-code', 'AI code edit'],
	['edit-session', 'Cloud-synced editing session'],
	['edit-sparkle', 'AI-powered edit'],
	['editor-layout', 'Configure editor group layout'],
	['ellipsis', 'More options'],
	['empty-window', 'Empty or new window'],
	['error', 'Error indicator'],
	['error-small', 'Small inline error indicator'],
	['extensions', 'Extensions panel'],
	['extensions-large', 'Large extensions icon'],
	['eye', 'Preview or reveal'],
	['eye-closed', 'Hidden or concealed'],
	['feedback', 'Feedback or reviewer'],
	['file', 'Generic file'],
	['file-add', 'Create a new file'],
	['file-binary', 'Binary file'],
	['file-code', 'Source code file'],
	['file-directory', 'Folder'],
	['file-directory-create', 'Create a new folder'],
	['file-media', 'Media file'],
	['file-pdf', 'PDF document'],
	['file-submodule', 'Git submodule file'],
	['file-symlink-directory', 'Symlinked directory'],
	['file-symlink-file', 'Symlinked file'],
	['file-text', 'Plain-text file'],
	['file-zip', 'Compressed archive file'],
	['files', 'Explorer or files panel'],
	['filter', 'Filter items in a list'],
	['filter-filled', 'Filter is actively applied'],
	['flame', 'Flame for a hot path or performance'],
	['fold', 'Fold or collapse a code region'],
	['folder', 'Folder'],
	['folder-active', 'Active or focused folder'],
	['folder-library', 'Library or vendor folder'],
	['folder-opened', 'Currently opened folder'],
	['gear', 'Settings or gear'],
	['gift', 'Gift or new feature'],
	['gist', 'GitHub Gist snippet'],
	['gist-fork', 'Forked repository or gist'],
	['gist-new', 'Create a new item'],
	['gist-secret', 'Secret or private Gist'],
	['git-branch', 'Git branch'],
	['git-branch-changes', 'Branch with uncommitted changes'],
	['git-branch-conflicts', 'Branch with merge conflicts'],
	['git-branch-create', 'Create a new Git branch'],
	['git-branch-delete', 'Delete a Git branch'],
	['git-branch-staged-changes', 'Branch with staged changes'],
	['git-commit', 'Git commit'],
	['git-compare', 'Compare changes between refs'],
	['git-fetch', 'Fetch from a Git remote'],
	['git-merge', 'Git merge'],
	['git-pull-request', 'Open pull request'],
	['git-pull-request-abandoned', 'Abandoned pull request'],
	['git-pull-request-assignee', 'Pull request assignee'],
	['git-pull-request-closed', 'Closed pull request'],
	['git-pull-request-create', 'Create a new pull request'],
	['git-pull-request-done', 'Completed or merged pull request'],
	['git-pull-request-draft', 'Draft pull request'],
	['git-pull-request-go-to-changes', 'Go to pull request changes'],
	['git-pull-request-label', 'Pull request label'],
	['git-pull-request-milestone', 'Pull request milestone'],
	['git-pull-request-new-changes', 'New changes in a pull request'],
	['git-pull-request-reviewer', 'Pull request reviewer'],
	['git-stash', 'Stash current changes'],
	['git-stash-apply', 'Apply a stash without removing it'],
	['git-stash-pop', 'Pop and apply the top stash'],
	['github', 'GitHub logo'],
	['github-action', 'GitHub Actions workflow'],
	['github-alt', 'GitHub alternate logo'],
	['github-inverted', 'GitHub logo in inverted colours'],
	['github-project', 'GitHub Projects'],
	['globe', 'Globe for web or international'],
	['go-to-editing-session', 'Resume a cloud editing session'],
	['go-to-file', 'Go to a file or reference'],
	['go-to-search', 'Jump to search'],
	['graph', 'Graph or chart'],
	['graph-left', 'Left-aligned graph'],
	['graph-line', 'Line chart'],
	['graph-scatter', 'Scatter plot'],
	['gripper', 'Resize gripper handle'],
	['group-by-ref-type', 'Group items by reference type'],
	['heart', 'Heart or favourite'],
	['heart-filled', 'Filled heart'],
	['history', 'Clock or history'],
	['home', 'Home or navigate to root'],
	['horizontal-rule', 'Horizontal divider rule'],
	['hubot', 'GitHub Hubot mascot'],
	['import', 'Import content into the current context'],
	['inbox', 'Inbox'],
	['index-zero', 'Index zero or the first position'],
	['info', 'Informational notice'],
	['insert', 'Insert content at the cursor'],
	['inspect', 'Inspect element'],
	['issue-closed', 'Closed issue'],
	['issue-draft', 'Draft issue or pending breakpoint'],
	['issue-opened', 'Opened issue'],
	['issue-reopened', 'Reopened issue'],
	['issues', 'Issues list'],
	['json', 'JSON or curly-bracket file'],
	['keyboard', 'Keyboard or recorded keys'],
	['key', 'Key for authentication or a shortcut'],
	['law', 'Law, policy, or legal licence'],
	['layout', 'Toggle workbench layout options'],
	['layers', 'Layers'],
	['layers-active', 'Currently active layer'],
	['layers-dot', 'Layers with activity dot'],
	['library', 'Library of resources'],
	['lightbulb', 'Lightbulb for a code action or suggestion'],
	['lightbulb-autofix', 'Lightbulb with an autofix suggestion'],
	['lightbulb-empty', 'No code actions available'],
	['lightbulb-sparkle', 'AI-powered code action'],
	['lightbulb-sparkle-autofix', 'AI-powered autofix suggestion'],
	['live-share', 'Live Share collaboration session'],
	['loading', 'Loading spinner'],
	['lock', 'Locked, private, or secured'],
	['lock-small', 'Small lock indicator'],
	['magnet', 'Magnet for snap or attract'],
	['mail', 'Email'],
	['mail-read', 'Read email'],
	['mail-reply', 'Reply to an email or comment'],
	['map', 'Minimap'],
	['mcp', 'Model Context Protocol'],
	['megaphone', 'Megaphone or announcement'],
	['menu', 'Context or application menu'],
	['menubar-more', 'Additional menu-bar items'],
	['mention', 'Mention or at-sign reference'],
	['merge', 'Merge two items or branches'],
	['merge-into', 'Merge the current branch into another'],
	['mic', 'Microphone'],
	['mic-filled', 'Active microphone'],
	['microscope', 'Microscope or detailed inspection'],
	['milestone', 'Milestone'],
	['more', 'More options'],
	['move', 'Move an item'],
	['multiple-windows', 'Multiple editor windows open'],
	['music', 'Music note'],
	['newline', 'Newline character indicator'],
	['new-collection', 'Create a new collection'],
	['new-file', 'Create a new file'],
	['new-folder', 'Create a new folder'],
	['new-session', 'Start a new session'],
	['no-newline', 'No newline at end of file'],
	['notebook', 'Jupyter or interactive notebook'],
	['notebook-template', 'Notebook template'],
	['octoface', 'GitHub Octocat mascot'],
	['openai', 'OpenAI logo'],
	['open-in-product', 'Open the item in the main product window'],
	['open-in-window', 'Open in a new window'],
	['open-preview', 'Open the rendered preview'],
	['organization', 'Organization or team'],
	['output', 'Output panel or output channel'],
	['package', 'Package or bundle'],
	['pass', 'Pass or success'],
	['pass-filled', 'Filled pass badge'],
	['percentage', 'Percentage value'],
	['person', 'User or person'],
	['person-add', 'Add a user'],
	['person-filled', 'User or person'],
	['person-follow', 'Follow a user'],
	['person-outline', 'User or person'],
	['pie-chart', 'Pie chart'],
	['piano', 'Piano keyboard'],
	['pin', 'Pin an item to keep it visible'],
	['pinned', 'Item is pinned'],
	['pinned-dirty', 'Pinned item with unsaved changes'],
	['play', 'Run or play'],
	['play-circle', 'Play within a circle'],
	['plug', 'Plugin or extension connector'],
	['preview', 'Preview pane'],
	['primitive-dot', 'Solid filled circle'],
	['primitive-square', 'Filled square shape'],
	['project', 'Project board'],
	['pulse', 'Activity or heartbeat indicator'],
	['python', 'Python language'],
	['quote', 'Block quote'],
	['quotes', 'Quotation marks'],
	['radio-tower', 'Radio tower for remote or live broadcast'],
	['record', 'Start recording'],
	['record-keys', 'Record key bindings'],
	['record-small', 'Small record button'],
	['redo', 'Redo the last undone action'],
	['references', 'References or find usages'],
	['refresh', 'Refresh or reload'],
	['regex', 'Toggle regular-expression mode'],
	['repl', 'REPL or interactive console'],
	['replace', 'Replace a single match'],
	['replace-all', 'Replace all matches'],
	['reply', 'Reply to an email or comment'],
	['report', 'Report or flagged issue'],
	['request-changes', 'Request changes on a review'],
	['rocket', 'Rocket for deploy or launch'],
	['root-folder', 'Root workspace folder'],
	['root-folder-opened', 'Opened root workspace folder'],
	['rss', 'RSS feed'],
	['ruby', 'Ruby language'],
	['run', 'Run or play'],
	['run-above', 'Run all notebook cells above'],
	['run-all', 'Run all tasks or tests'],
	['run-all-coverage', 'Run all tests with coverage'],
	['run-below', 'Run all notebook cells below'],
	['run-coverage', 'Run a single test with coverage'],
	['run-errors', 'Run and report errors'],
	['run-with-deps', 'Run a task including its dependencies'],
	['save', 'Save the current file'],
	['save-all', 'Save all open files'],
	['save-as', 'Save to a new location'],
	['screen-cut', 'Capture a screenshot'],
	['screen-full', 'Enter fullscreen'],
	['screen-normal', 'Exit fullscreen'],
	['search', 'Search'],
	['search-fuzzy', 'Toggle fuzzy or approximate matching'],
	['search-large', 'Large search icon'],
	['search-sparkle', 'AI-powered search'],
	['search-stop', 'Stop an active search'],
	['selection', 'Selection mode'],
	['send', 'Send a message or payload'],
	['send-to-remote-agent', 'Send the current item to a remote agent'],
	['server', 'Server'],
	['server-environment', 'Server environment'],
	['server-process', 'Server process'],
	['session-in-progress', 'A session is currently active'],
	['settings', 'Settings or gear'],
	['settings-gear', 'Detailed settings gear'],
	['share', 'Share with others'],
	['shield', 'Shield for security or trust'],
	['skip', 'Skip the current item'],
	['smiley', 'Smiley face or emoji'],
	['snake', 'Snake or Python mascot'],
	['source-control', 'Source control panel'],
	['sparkle', 'AI sparkle or intelligent feature'],
	['sparkle-filled', 'Filled AI sparkle'],
	['split-horizontal', 'Split the editor horizontally'],
	['split-vertical', 'Split the editor vertically'],
	['star', 'Star or favourite'],
	['star-add', 'Star or favourite'],
	['star-delete', 'Star or favourite'],
	['star-empty', 'Star or favourite'],
	['star-full', 'Fully filled star'],
	['star-half', 'Half-filled star'],
	['stop', 'Stop execution'],
	['stop-circle', 'Stop within a circle'],
	['strikethrough', 'Strikethrough text'],
	['surround-with', 'Surround a selection with a snippet'],
	['sync', 'Sync with a remote'],
	['sync-ignored', 'Sync ignored or excluded from sync'],
	['table', 'Table or spreadsheet'],
	['tag', 'Tag or label'],
	['tag-add', 'Tag or label'],
	['tag-remove', 'Tag or label'],
	['target', 'Target or focus point'],
	['tasklist', 'Task list'],
	['telescope', 'Telescope for broad search'],
	['terminal', 'Terminal or console panel'],
	['terminal-bash', 'Bash shell terminal'],
	['terminal-cmd', 'Windows Command Prompt terminal'],
	['terminal-debian', 'Debian terminal'],
	['terminal-decoration-error', 'Terminal command failed'],
	['terminal-decoration-incomplete', 'Terminal command is still running'],
	['terminal-decoration-mark', 'Terminal bookmark mark'],
	['terminal-decoration-success', 'Terminal command succeeded'],
	['terminal-git-bash', 'Git Bash terminal'],
	['terminal-linux', 'Linux terminal'],
	['terminal-powershell', 'PowerShell terminal'],
	['terminal-secure', 'Secure or SSH terminal'],
	['terminal-tmux', 'tmux terminal'],
	['terminal-ubuntu', 'Ubuntu terminal'],
	['text-size', 'Adjust text or font size'],
	['thinking', 'AI is thinking or processing'],
	['three-bars', 'Hamburger or main menu'],
	['thumbsdown', 'Thumbs down'],
	['thumbsdown-filled', 'Filled thumbs down'],
	['thumbsup', 'Thumbs up'],
	['thumbsup-filled', 'Filled thumbs up'],
	['toolbar-more', 'Additional toolbar items'],
	['tools', 'Toolbox'],
	['trash', 'Delete permanently'],
	['trashcan', 'Delete permanently'],
	['tree-filter-clear', 'Clear the active tree filter'],
	['tree-filter-on-type-off', 'Filter-on-type mode disabled'],
	['tree-filter-on-type-on', 'Filter-on-type mode enabled'],
	['tree-item-expanded', 'Expanded tree item'],
	['tree-item-loading', 'Tree item loading state'],
	['type-hierarchy', 'Type hierarchy view'],
	['type-hierarchy-sub', 'Subtype in a type hierarchy'],
	['type-hierarchy-super', 'Supertype in a type hierarchy'],
	['ungroup-by-ref-type', 'Remove reference-type grouping'],
	['unlock', 'Unlocked or public'],
	['unverified', 'Unverified status badge'],
	['unarchive', 'Restore from an archive'],
	['verified', 'Verified status badge'],
	['verified-filled', 'Filled verified status badge'],
	['versions', 'Version history'],
	['vm', 'Virtual machine or desktop device'],
	['vm-active', 'Active virtual machine'],
	['vm-connect', 'Connect to a virtual machine'],
	['vm-outline', 'Virtual machine outline'],
	['vm-running', 'Running virtual machine'],
	['vm-small', 'Small virtual machine icon'],
	['vr', 'Virtual reality'],
	['vscode', 'Visual Studio Code logo'],
	['vscode-insiders', 'VS Code Insiders logo'],
	['wand', 'Magic wand for a quick transform'],
	['warning', 'Warning or alert'],
	['watch', 'Wristwatch'],
	['whitespace', 'Show or hide whitespace characters'],
	['whole-word', 'Toggle whole-word matching'],
	['window', 'Application window'],
	['window-active', 'Currently active window'],
	['word-wrap', 'Toggle word wrap'],
	['worktree', 'Git worktree'],
	['worktree-small', 'Small git worktree icon'],
	['workspace-trusted', 'Workspace is trusted'],
	['workspace-untrusted', 'Workspace is not trusted'],
	['workspace-unknown', 'Workspace trust is unknown'],
	['workspace-unspecified', 'Workspace trust is unknown'],
	['wrench', 'Wrench or tool'],
	['wrench-subaction', 'Wrench or tool'],
	['x', 'Close or dismiss'],
	['zap', 'Lightning bolt for a quick action or event'],
	['zoom-in', 'Zoom in'],
	['zoom-out', 'Zoom out'],
]);

const directionalLabels = new Map<string, string>([
	['up', 'up'],
	['down', 'down'],
	['left', 'left'],
	['right', 'right'],
]);

export function showCodiconGallery(instantiationService: IInstantiationService): Promise<void> {
	return getCodiconGalleryManager(instantiationService).show();
}

let codiconGalleryManager: CodiconGalleryManager | undefined;

function getCodiconGalleryManager(instantiationService: IInstantiationService): CodiconGalleryManager {
	if (!codiconGalleryManager) {
		codiconGalleryManager = instantiationService.createInstance(CodiconGalleryManager);
	}

	return codiconGalleryManager;
}

export class CodiconGalleryManager extends Disposable {

	static readonly viewType = 'codiconGallery';

	private _currentPanel: WebviewInput | undefined;

	constructor(
		@IWebviewWorkbenchService private readonly webviewWorkbenchService: IWebviewWorkbenchService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super();
	}

	async show(): Promise<void> {
		const title = 'Codicon Debug Gallery';
		const activeEditorPane = this.editorService.activeEditorPane;

		if (this._currentPanel) {
			this._currentPanel.setWebviewTitle(title);
			this._currentPanel.webview.setHtml(this.renderHtml());
			this.webviewWorkbenchService.revealWebview(this._currentPanel, activeEditorPane ? activeEditorPane.group : this.editorGroupService.activeGroup, false);
			return;
		}

		const codiconRoots = getCodiconFontRoots();
		const panel = this.webviewWorkbenchService.openWebview(
			{
				title,
				options: {
					enableFindWidget: true,
					tryRestoreScrollPosition: true,
				},
				contentOptions: {
					allowScripts: true,
					localResourceRoots: codiconRoots,
				},
				extension: undefined,
			},
			CodiconGalleryManager.viewType,
			title,
			Codicon.symbolCustomColor,
			{ group: activeEditorPane ? activeEditorPane.group : ACTIVE_GROUP, preserveFocus: false }
		);

		this._currentPanel = panel;

		const disposables = new DisposableStore();
		disposables.add(panel.webview.onMessage(async (message: unknown) => {
			if (!isCopyClassMessage(message)) {
				return;
			}

			await this.clipboardService.writeText(message.value);
			await panel.webview.postMessage({ type: 'copied', iconId: message.iconId });
		}));
		disposables.add(panel.onWillDispose(() => {
			disposables.dispose();
			this._currentPanel = undefined;
		}));

		panel.webview.setHtml(this.renderHtml());
	}

	private renderHtml(): string {
		const nonce = generateUuid();
		const fontUris = getCodiconFontUris();
		const fontSources = fontUris.map(fontUri => `url('${fontUri}') format('truetype')`).join(',\n\t\t\t\t\t');
		const fontPolicies = Array.from(new Set(fontUris.map(fontUri => {
			const fontScheme = URI.parse(fontUri).scheme;
			return fontScheme === 'https' ? 'https:' : `${fontScheme}:`;
		}))).join(' ');
		const entries = getSortedCodiconEntries();
		const rows = entries.map(entry => this.renderRow(entry)).join('\n');

		return `<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${fontPolicies} data:;">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Codicon Debug Gallery</title>
		<style nonce="${nonce}">
			:root {
				--icon-size: 16px;
				--icon-weight: 400;
			}

			@font-face {
				font-family: 'codicon';
				font-display: block;
				src: ${fontSources};
			}

			html, body {
				margin: 0;
				padding: 0;
				background: var(--vscode-editor-background);
				color: var(--vscode-editor-foreground);
				font-family: var(--vscode-font-family);
				font-size: var(--vscode-font-size);
				line-height: 1.5;
			}

			body {
				padding: 0 16px 16px;
			}

			.toolbar {
				position: sticky;
				top: 0;
				z-index: 1;
				display: flex;
				flex-wrap: wrap;
				gap: 12px 16px;
				align-items: end;
				padding: 16px 0 12px;
				background: var(--vscode-editor-background);
				border-bottom: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
			}

			.toolbar-group {
				display: flex;
				flex-direction: column;
				gap: 6px;
				min-width: 220px;
			}

			.toolbar-label {
				font-size: 12px;
				color: var(--vscode-descriptionForeground);
			}

			.toolbar input {
				width: min(360px, 100%);
				padding: 6px 8px;
				border: 1px solid var(--vscode-input-border, transparent);
				background: var(--vscode-input-background);
				color: var(--vscode-input-foreground);
				border-radius: 4px;
			}

			.size-picker,
			.style-picker {
				display: inline-flex;
				gap: 8px;
				flex-wrap: wrap;
			}

			.size-button,
			.style-button,
			.copy-button {
				padding: 4px 8px;
				border: 1px solid var(--vscode-button-border, transparent);
				background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
				color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
				border-radius: 4px;
				cursor: pointer;
			}

			.size-button[aria-pressed="true"],
			.style-button[aria-pressed="true"] {
				background: var(--vscode-button-background);
				color: var(--vscode-button-foreground);
			}

			.summary {
				margin-left: auto;
				align-self: center;
				color: var(--vscode-descriptionForeground);
				font-size: 12px;
			}

			.gallery-shell {
				overflow-x: auto;
				padding-bottom: 8px;
			}

			.gallery {
				width: 100%;
				min-width: 760px;
				border-collapse: collapse;
				table-layout: fixed;
			}

			.gallery th,
			.gallery td {
				padding: 10px 8px;
				border-bottom: 1px solid var(--vscode-panel-border);
				vertical-align: middle;
				text-align: left;
			}

			.gallery th {
				color: var(--vscode-descriptionForeground);
				font-weight: 600;
			}

			.gallery col.icon-column {
				width: 112px;
			}

			.gallery col.id-column {
				width: 220px;
			}

			.gallery col.copy-column {
				width: 220px;
			}

			.codicon-preview {
				font: normal normal normal var(--icon-size)/1 codicon;
				font-weight: var(--icon-weight);
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: calc(var(--icon-size) + 12px);
				height: calc(var(--icon-size) + 12px);
				-webkit-font-smoothing: antialiased;
				-moz-osx-font-smoothing: grayscale;
				user-select: none;
			}

			.icon-id {
				font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
				overflow-wrap: anywhere;
			}

			.description {
				color: var(--vscode-descriptionForeground);
			}

			.hidden-row {
				display: none;
			}

			.empty-state {
				display: none;
				padding: 24px 0;
				color: var(--vscode-descriptionForeground);
			}

			.empty-state.visible {
				display: block;
			}

			@media (max-width: 540px) {
				body {
					padding: 0 12px 12px;
				}

				.summary {
					margin-left: 0;
					width: 100%;
				}

				.gallery,
				.gallery thead,
				.gallery tbody,
				.gallery tr,
				.gallery th,
				.gallery td {
					display: block;
				}

				.gallery thead {
					display: none;
				}

				.gallery tr {
					padding: 8px 0;
				}

				.gallery td {
					padding: 6px 0;
					border: 0;
				}

				.gallery td::before {
					display: block;
					margin-bottom: 4px;
					color: var(--vscode-descriptionForeground);
					font-size: 12px;
					font-weight: 600;
				}

				.gallery td[data-label]::before {
					content: attr(data-label);
				}
			}
		</style>
	</head>
	<body>
		<div class="toolbar">
			<label class="toolbar-group" for="filter-input">
				<span class="toolbar-label">Filter</span>
				<input id="filter-input" type="search" placeholder="Filter by id or description" autocomplete="off">
			</label>
			<div class="toolbar-group" role="group" aria-label="Codicon size">
				<span class="toolbar-label">Size</span>
				<div class="size-picker">
					<button class="size-button" type="button" data-size="12" aria-pressed="false">12</button>
					<button class="size-button" type="button" data-size="16" aria-pressed="true">16</button>
					<button class="size-button" type="button" data-size="24" aria-pressed="false">24</button>
					<button class="size-button" type="button" data-size="48" aria-pressed="false">48</button>
				</div>
			</div>
			<div class="toolbar-group" role="group" aria-label="Codicon style">
				<span class="toolbar-label">Style</span>
				<div class="style-picker">
					<button class="style-button" type="button" data-weight="700" aria-pressed="false">Bold</button>
				</div>
			</div>
			<div class="summary" id="result-count">${entries.length} / ${entries.length}</div>
		</div>
		<div class="gallery-shell">
			<table class="gallery" aria-label="Codicon gallery">
				<colgroup>
					<col class="icon-column">
					<col class="id-column">
					<col>
					<col class="copy-column">
				</colgroup>
				<thead>
					<tr>
						<th>Glyph</th>
						<th>Id</th>
						<th>Description</th>
						<th>Copy</th>
					</tr>
				</thead>
				<tbody id="gallery-body">
${rows}
				</tbody>
			</table>
		</div>
		<div class="empty-state" id="empty-state">No codicons match the current filter.</div>
		<script nonce="${nonce}">
			const vscode = acquireVsCodeApi();
			const filterInput = document.getElementById('filter-input');
			const resultCount = document.getElementById('result-count');
			const galleryBody = document.getElementById('gallery-body');
			const emptyState = document.getElementById('empty-state');
			const rows = Array.from(galleryBody.querySelectorAll('tr'));
			const sizeButtons = Array.from(document.querySelectorAll('.size-button'));
			const styleButtons = Array.from(document.querySelectorAll('.style-button'));
			const resetTimers = new Map();

			function updateCount() {
				const visibleCount = rows.filter(row => !row.classList.contains('hidden-row')).length;
				resultCount.textContent = visibleCount + ' / ' + rows.length;
				emptyState.classList.toggle('visible', visibleCount === 0);
			}

			function applyFilter() {
				const query = filterInput.value.trim().toLowerCase();
				for (const row of rows) {
					const searchText = row.dataset.search || '';
					const matches = !query || searchText.includes(query);
					row.classList.toggle('hidden-row', !matches);
				}
				updateCount();
			}

			filterInput.addEventListener('input', applyFilter);

			for (const button of sizeButtons) {
				button.addEventListener('click', () => {
					const size = button.dataset.size || '16';
					document.documentElement.style.setProperty('--icon-size', size + 'px');
					for (const candidate of sizeButtons) {
						candidate.setAttribute('aria-pressed', String(candidate === button));
					}
				});
			}

			for (const button of styleButtons) {
				button.addEventListener('click', () => {
					const isPressed = button.getAttribute('aria-pressed') === 'true';
					const nextPressed = !isPressed;
					document.documentElement.style.setProperty('--icon-weight', nextPressed ? (button.dataset.weight || '700') : '400');
					button.setAttribute('aria-pressed', String(nextPressed));
				});
			}

			document.addEventListener('click', event => {
				const target = event.target;
				if (!(target instanceof HTMLElement)) {
					return;
				}

				const button = target.closest('.copy-button');
				if (!(button instanceof HTMLButtonElement)) {
					return;
				}

				vscode.postMessage({
					type: 'copyClass',
					iconId: button.dataset.iconId,
					value: button.dataset.copyValue,
				});
			});

			window.addEventListener('message', event => {
				const message = event.data;
				if (!message || message.type !== 'copied') {
					return;
				}

				const button = document.querySelector('.copy-button[data-icon-id="' + message.iconId + '"]');
				if (!(button instanceof HTMLButtonElement)) {
					return;
				}

				if (!button.dataset.defaultLabel) {
					button.dataset.defaultLabel = button.textContent || '';
				}

				button.textContent = '✓ Copied';

				const existingTimer = resetTimers.get(message.iconId);
				if (existingTimer) {
					clearTimeout(existingTimer);
				}

				const timer = setTimeout(() => {
					button.textContent = button.dataset.defaultLabel || '';
					resetTimers.delete(message.iconId);
				}, 1200);
				resetTimers.set(message.iconId, timer);
			});

			applyFilter();
		</script>
	</body>
</html>`;
	}

	private renderRow(entry: ICodiconEntry): string {
		const copyValue = `codicon codicon-${entry.id}`;
		const searchText = `${entry.id} ${entry.description}`.toLowerCase();

		return `				<tr data-search="${escapeAttribute(searchText)}">
					<td data-label="Glyph"><span class="codicon-preview" aria-hidden="true">${escape(entry.glyph)}</span></td>
					<td data-label="Id"><span class="icon-id">${escape(entry.id)}</span></td>
					<td data-label="Description"><span class="description">${escape(entry.description)}</span></td>
					<td data-label="Copy">
						<button
							class="copy-button"
							type="button"
							data-icon-id="${escapeAttribute(entry.id)}"
							data-copy-value="${escapeAttribute(copyValue)}"
						>codicon-${escape(entry.id)}</button>
					</td>
				</tr>`;
	}
}

function getSortedCodiconEntries(): ICodiconEntry[] {
	const fontCharacters = getCodiconFontCharacters();
	const seenIds = new Set<string>();
	const entries: ICodiconEntry[] = [];

	for (const icon of getAllCodicons()) {
		if (seenIds.has(icon.id)) {
			continue;
		}

		const codepoint = fontCharacters[icon.id];
		if (typeof codepoint !== 'number') {
			continue;
		}

		seenIds.add(icon.id);
		entries.push({
			id: icon.id,
			description: describeCodicon(icon.id),
			glyph: String.fromCodePoint(codepoint),
		});
	}

	entries.sort((left, right) => left.id.localeCompare(right.id));
	return entries;
}

function getCodiconFontRoots(): URI[] {
	return [
		FileAccess.asFileUri('vs/base/browser/ui/codicons/codicon'),
		FileAccess.asFileUri('vs/../../node_modules/@vscode/codicons/dist'),
	];
}

function getCodiconFontUris(): string[] {
	return [
		asWebviewUri(FileAccess.asFileUri('vs/base/browser/ui/codicons/codicon/codicon.ttf')).toString(true),
		asWebviewUri(FileAccess.asFileUri('vs/../../node_modules/@vscode/codicons/dist/codicon.ttf')).toString(true),
	];
}

function describeCodicon(id: string): string {
	const exact = exactDescriptions.get(id);
	if (exact) {
		return exact;
	}

	if (id.startsWith('arrow-circle-')) {
		return withDirection('Circular arrow pointing ', id.substring('arrow-circle-'.length));
	}

	if (id.startsWith('arrow-small-')) {
		return withDirection('Small arrow pointing ', id.substring('arrow-small-'.length));
	}

	if (id.startsWith('arrow-')) {
		return withDirection('Arrow pointing ', id.substring('arrow-'.length));
	}

	if (id.startsWith('chevron-')) {
		return withDirection('Chevron pointing ', id.substring('chevron-'.length));
	}

	if (id.startsWith('triangle-')) {
		return withDirection('Triangle pointing ', id.substring('triangle-'.length));
	}

	if (id.startsWith('chrome-')) {
		return `Window ${humanizeTokens(id.substring('chrome-'.length))} button`;
	}

	if (id.startsWith('scrollbar-button-')) {
		return `Scroll ${humanizeTokens(id.substring('scrollbar-button-'.length))}`;
	}

	if (id.startsWith('layout-')) {
		return `Layout: ${humanizeTokens(id.substring('layout-'.length))}`;
	}

	if (id.startsWith('symbol-')) {
		return `${humanizeTokens(id.substring('symbol-'.length))} symbol`;
	}

	if (id.startsWith('terminal-decoration-')) {
		return `Terminal decoration: ${humanizeTokens(id.substring('terminal-decoration-'.length))}`;
	}

	if (id.startsWith('terminal-')) {
		return `${humanizeTokens(id.substring('terminal-'.length))} terminal`;
	}

	if (id.startsWith('type-hierarchy-')) {
		return `${humanizeTokens(id.substring('type-hierarchy-'.length))} in a type hierarchy`;
	}

	if (id.startsWith('tree-')) {
		return `Tree ${humanizeTokens(id.substring('tree-'.length))}`;
	}

	if (id.startsWith('list-')) {
		return `${humanizeTokens(id.substring('list-'.length))} list`;
	}

	if (id.startsWith('workspace-')) {
		return `Workspace ${humanizeTokens(id.substring('workspace-'.length))}`;
	}

	if (id.startsWith('folder-')) {
		return `Folder: ${humanizeTokens(id.substring('folder-'.length))}`;
	}

	if (id.startsWith('root-folder-')) {
		return `Root workspace folder: ${humanizeTokens(id.substring('root-folder-'.length))}`;
	}

	if (id.startsWith('file-')) {
		return `File: ${humanizeTokens(id.substring('file-'.length))}`;
	}

	if (id.startsWith('search-')) {
		return `Search: ${humanizeTokens(id.substring('search-'.length))}`;
	}

	if (id.startsWith('git-pull-request-')) {
		return `Pull request: ${humanizeTokens(id.substring('git-pull-request-'.length))}`;
	}

	if (id.startsWith('git-branch-')) {
		return `Git branch: ${humanizeTokens(id.substring('git-branch-'.length))}`;
	}

	if (id.startsWith('git-stash-')) {
		return `Git stash: ${humanizeTokens(id.substring('git-stash-'.length))}`;
	}

	if (id.startsWith('git-')) {
		return `Git ${humanizeTokens(id.substring('git-'.length))}`;
	}

	if (id.startsWith('repo-')) {
		return `Repository: ${humanizeTokens(id.substring('repo-'.length))}`;
	}

	if (id.startsWith('diff-')) {
		return `Diff: ${humanizeTokens(id.substring('diff-'.length))}`;
	}

	if (id.startsWith('run-')) {
		return `Run: ${humanizeTokens(id.substring('run-'.length))}`;
	}

	if (id.startsWith('debug-breakpoint-')) {
		return `Breakpoint: ${humanizeTokens(id.substring('debug-breakpoint-'.length))}`;
	}

	if (id.startsWith('debug-stackframe-')) {
		return `Debug stack frame: ${humanizeTokens(id.substring('debug-stackframe-'.length))}`;
	}

	if (id.startsWith('debug-')) {
		return `Debug: ${humanizeTokens(id.substring('debug-'.length))}`;
	}

	if (id.startsWith('copilot-')) {
		return `Copilot: ${humanizeTokens(id.substring('copilot-'.length))}`;
	}

	if (id.startsWith('lightbulb-')) {
		return `Lightbulb: ${humanizeTokens(id.substring('lightbulb-'.length))}`;
	}

	if (id.startsWith('chat-')) {
		return `Chat: ${humanizeTokens(id.substring('chat-'.length))}`;
	}

	if (id.startsWith('comment-')) {
		return `Comment: ${humanizeTokens(id.substring('comment-'.length))}`;
	}

	if (id.startsWith('cloud-')) {
		return `Cloud: ${humanizeTokens(id.substring('cloud-'.length))}`;
	}

	if (id.startsWith('person-')) {
		return `Person: ${humanizeTokens(id.substring('person-'.length))}`;
	}

	if (id.startsWith('organization-')) {
		return `Organization: ${humanizeTokens(id.substring('organization-'.length))}`;
	}

	if (id.startsWith('vm-')) {
		return `Virtual machine: ${humanizeTokens(id.substring('vm-'.length))}`;
	}

	if (id.startsWith('server-')) {
		return `Server: ${humanizeTokens(id.substring('server-'.length))}`;
	}

	if (id.startsWith('notebook-')) {
		return `Notebook: ${humanizeTokens(id.substring('notebook-'.length))}`;
	}

	if (id.startsWith('open-in-')) {
		return `Open ${humanizeTokens(id.substring('open-in-'.length))}`;
	}

	return humanizeTokens(id);
}

function withDirection(prefix: string, suffix: string): string {
	return `${prefix}${directionalLabels.get(suffix) ?? humanizeTokens(suffix).toLowerCase()}`;
}

function humanizeTokens(value: string): string {
	const tokens = value.split('-').filter(Boolean);
	const phrase = tokens.map(token => humanizeToken(token)).join(' ');
	return phrase ? phrase[0].toUpperCase() + phrase.slice(1) : value;
}

function humanizeToken(token: string): string {
	switch (token) {
		case 'ai':
			return 'AI';
		case 'json':
			return 'JSON';
		case 'pdf':
			return 'PDF';
		case 'mcp':
			return 'MCP';
		case 'vm':
			return 'VM';
		case 'repl':
			return 'REPL';
		case 'ssh':
			return 'SSH';
		case 'tmux':
			return 'tmux';
		case 'rss':
			return 'RSS';
		case 'github':
			return 'GitHub';
		case 'openai':
			return 'OpenAI';
		case 'claude':
			return 'Claude';
		case 'vscode':
			return 'VS Code';
		case 'oss':
			return 'OSS';
		case 'cmd':
			return 'Command Prompt';
		case 'bash':
			return 'Bash';
		case 'debian':
			return 'Debian';
		case 'ubuntu':
			return 'Ubuntu';
		case 'powershell':
			return 'PowerShell';
		case 'git':
			return 'Git';
		case 'pr':
			return 'PR';
		default:
			return token;
	}
}

function escapeAttribute(value: string): string {
	return escape(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isCopyClassMessage(message: unknown): message is ICopyClassMessage {
	if (!message || typeof message !== 'object') {
		return false;
	}

	const candidate = message as Partial<ICopyClassMessage>;
	return candidate.type === 'copyClass' && typeof candidate.iconId === 'string' && typeof candidate.value === 'string';
}
