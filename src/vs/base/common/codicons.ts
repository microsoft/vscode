/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';

export interface IIconRegistry {
	readonly all: IterableIterator<Codicon>;
	readonly onDidRegister: Event<Codicon>;
	get(id: string): Codicon | undefined;
}

// Selects all codicon names encapsulated in the `$()` syntax and wraps the
// results with spaces so that screen readers can read the text better.
export function getCodiconAriaLabel(text: string | undefined) {
	if (!text) {
		return '';
	}

	return text.replace(/\$\((.*?)\)/g, (_match, codiconName) => ` ${codiconName} `).trim();
}

/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
export class Codicon implements CSSIcon {

	private constructor(public readonly id: string, public readonly definition: IconDefinition, public description?: string) {
		Codicon._allCodicons.push(this);
	}
	public get classNames() { return 'codicon codicon-' + this.id; }
	// classNamesArray is useful for migrating to ES6 classlist
	public get classNamesArray() { return ['codicon', 'codicon-' + this.id]; }
	public get cssSelector() { return '.codicon.codicon-' + this.id; }

	// registry
	private static _allCodicons: Codicon[] = [];

	/**
	 * @returns Returns all default icons covered by the codicon font. Only to be used by the icon registry in platform.
	 */
	public static getAll(): readonly Codicon[] {
		return Codicon._allCodicons;
	}

	// built-in icons, with image name
	public static readonly add = new Codicon('add', { fontCharacter: '\\ea60' });
	public static readonly plus = new Codicon('plus', Codicon.add.definition);
	public static readonly gistNew = new Codicon('gist-new', Codicon.add.definition);
	public static readonly repoCreate = new Codicon('repo-create', Codicon.add.definition);
	public static readonly lightbulb = new Codicon('lightbulb', { fontCharacter: '\\ea61' });
	public static readonly lightBulb = new Codicon('light-bulb', { fontCharacter: '\\ea61' });
	public static readonly repo = new Codicon('repo', { fontCharacter: '\\ea62' });
	public static readonly repoDelete = new Codicon('repo-delete', { fontCharacter: '\\ea62' });
	public static readonly gistFork = new Codicon('gist-fork', { fontCharacter: '\\ea63' });
	public static readonly repoForked = new Codicon('repo-forked', { fontCharacter: '\\ea63' });
	public static readonly gitPullRequest = new Codicon('git-pull-request', { fontCharacter: '\\ea64' });
	public static readonly gitPullRequestAbandoned = new Codicon('git-pull-request-abandoned', { fontCharacter: '\\ea64' });
	public static readonly recordKeys = new Codicon('record-keys', { fontCharacter: '\\ea65' });
	public static readonly keyboard = new Codicon('keyboard', { fontCharacter: '\\ea65' });
	public static readonly tag = new Codicon('tag', { fontCharacter: '\\ea66' });
	public static readonly tagAdd = new Codicon('tag-add', { fontCharacter: '\\ea66' });
	public static readonly tagRemove = new Codicon('tag-remove', { fontCharacter: '\\ea66' });
	public static readonly person = new Codicon('person', { fontCharacter: '\\ea67' });
	public static readonly personFollow = new Codicon('person-follow', { fontCharacter: '\\ea67' });
	public static readonly personOutline = new Codicon('person-outline', { fontCharacter: '\\ea67' });
	public static readonly personFilled = new Codicon('person-filled', { fontCharacter: '\\ea67' });
	public static readonly gitBranch = new Codicon('git-branch', { fontCharacter: '\\ea68' });
	public static readonly gitBranchCreate = new Codicon('git-branch-create', { fontCharacter: '\\ea68' });
	public static readonly gitBranchDelete = new Codicon('git-branch-delete', { fontCharacter: '\\ea68' });
	public static readonly sourceControl = new Codicon('source-control', { fontCharacter: '\\ea68' });
	public static readonly mirror = new Codicon('mirror', { fontCharacter: '\\ea69' });
	public static readonly mirrorPublic = new Codicon('mirror-public', { fontCharacter: '\\ea69' });
	public static readonly star = new Codicon('star', { fontCharacter: '\\ea6a' });
	public static readonly starAdd = new Codicon('star-add', { fontCharacter: '\\ea6a' });
	public static readonly starDelete = new Codicon('star-delete', { fontCharacter: '\\ea6a' });
	public static readonly starEmpty = new Codicon('star-empty', { fontCharacter: '\\ea6a' });
	public static readonly comment = new Codicon('comment', { fontCharacter: '\\ea6b' });
	public static readonly commentAdd = new Codicon('comment-add', { fontCharacter: '\\ea6b' });
	public static readonly alert = new Codicon('alert', { fontCharacter: '\\ea6c' });
	public static readonly warning = new Codicon('warning', { fontCharacter: '\\ea6c' });
	public static readonly search = new Codicon('search', { fontCharacter: '\\ea6d' });
	public static readonly searchSave = new Codicon('search-save', { fontCharacter: '\\ea6d' });
	public static readonly logOut = new Codicon('log-out', { fontCharacter: '\\ea6e' });
	public static readonly signOut = new Codicon('sign-out', { fontCharacter: '\\ea6e' });
	public static readonly logIn = new Codicon('log-in', { fontCharacter: '\\ea6f' });
	public static readonly signIn = new Codicon('sign-in', { fontCharacter: '\\ea6f' });
	public static readonly eye = new Codicon('eye', { fontCharacter: '\\ea70' });
	public static readonly eyeUnwatch = new Codicon('eye-unwatch', { fontCharacter: '\\ea70' });
	public static readonly eyeWatch = new Codicon('eye-watch', { fontCharacter: '\\ea70' });
	public static readonly circleFilled = new Codicon('circle-filled', { fontCharacter: '\\ea71' });
	public static readonly primitiveDot = new Codicon('primitive-dot', Codicon.circleFilled.definition);
	public static readonly closeDirty = new Codicon('close-dirty', Codicon.circleFilled.definition);
	public static readonly debugBreakpoint = new Codicon('debug-breakpoint', Codicon.circleFilled.definition);
	public static readonly debugBreakpointDisabled = new Codicon('debug-breakpoint-disabled', Codicon.circleFilled.definition);
	public static readonly debugHint = new Codicon('debug-hint', Codicon.circleFilled.definition);
	public static readonly primitiveSquare = new Codicon('primitive-square', { fontCharacter: '\\ea72' });
	public static readonly edit = new Codicon('edit', { fontCharacter: '\\ea73' });
	public static readonly pencil = new Codicon('pencil', { fontCharacter: '\\ea73' });
	public static readonly info = new Codicon('info', { fontCharacter: '\\ea74' });
	public static readonly issueOpened = new Codicon('issue-opened', { fontCharacter: '\\ea74' });
	public static readonly gistPrivate = new Codicon('gist-private', { fontCharacter: '\\ea75' });
	public static readonly gitForkPrivate = new Codicon('git-fork-private', { fontCharacter: '\\ea75' });
	public static readonly lock = new Codicon('lock', { fontCharacter: '\\ea75' });
	public static readonly mirrorPrivate = new Codicon('mirror-private', { fontCharacter: '\\ea75' });
	public static readonly close = new Codicon('close', { fontCharacter: '\\ea76' });
	public static readonly removeClose = new Codicon('remove-close', { fontCharacter: '\\ea76' });
	public static readonly x = new Codicon('x', { fontCharacter: '\\ea76' });
	public static readonly repoSync = new Codicon('repo-sync', { fontCharacter: '\\ea77' });
	public static readonly sync = new Codicon('sync', { fontCharacter: '\\ea77' });
	public static readonly clone = new Codicon('clone', { fontCharacter: '\\ea78' });
	public static readonly desktopDownload = new Codicon('desktop-download', { fontCharacter: '\\ea78' });
	public static readonly beaker = new Codicon('beaker', { fontCharacter: '\\ea79' });
	public static readonly microscope = new Codicon('microscope', { fontCharacter: '\\ea79' });
	public static readonly vm = new Codicon('vm', { fontCharacter: '\\ea7a' });
	public static readonly deviceDesktop = new Codicon('device-desktop', { fontCharacter: '\\ea7a' });
	public static readonly file = new Codicon('file', { fontCharacter: '\\ea7b' });
	public static readonly fileText = new Codicon('file-text', { fontCharacter: '\\ea7b' });
	public static readonly more = new Codicon('more', { fontCharacter: '\\ea7c' });
	public static readonly ellipsis = new Codicon('ellipsis', { fontCharacter: '\\ea7c' });
	public static readonly kebabHorizontal = new Codicon('kebab-horizontal', { fontCharacter: '\\ea7c' });
	public static readonly mailReply = new Codicon('mail-reply', { fontCharacter: '\\ea7d' });
	public static readonly reply = new Codicon('reply', { fontCharacter: '\\ea7d' });
	public static readonly organization = new Codicon('organization', { fontCharacter: '\\ea7e' });
	public static readonly organizationFilled = new Codicon('organization-filled', { fontCharacter: '\\ea7e' });
	public static readonly organizationOutline = new Codicon('organization-outline', { fontCharacter: '\\ea7e' });
	public static readonly newFile = new Codicon('new-file', { fontCharacter: '\\ea7f' });
	public static readonly fileAdd = new Codicon('file-add', { fontCharacter: '\\ea7f' });
	public static readonly newFolder = new Codicon('new-folder', { fontCharacter: '\\ea80' });
	public static readonly fileDirectoryCreate = new Codicon('file-directory-create', { fontCharacter: '\\ea80' });
	public static readonly trash = new Codicon('trash', { fontCharacter: '\\ea81' });
	public static readonly trashcan = new Codicon('trashcan', { fontCharacter: '\\ea81' });
	public static readonly history = new Codicon('history', { fontCharacter: '\\ea82' });
	public static readonly clock = new Codicon('clock', { fontCharacter: '\\ea82' });
	public static readonly folder = new Codicon('folder', { fontCharacter: '\\ea83' });
	public static readonly fileDirectory = new Codicon('file-directory', { fontCharacter: '\\ea83' });
	public static readonly symbolFolder = new Codicon('symbol-folder', { fontCharacter: '\\ea83' });
	public static readonly logoGithub = new Codicon('logo-github', { fontCharacter: '\\ea84' });
	public static readonly markGithub = new Codicon('mark-github', { fontCharacter: '\\ea84' });
	public static readonly github = new Codicon('github', { fontCharacter: '\\ea84' });
	public static readonly terminal = new Codicon('terminal', { fontCharacter: '\\ea85' });
	public static readonly console = new Codicon('console', { fontCharacter: '\\ea85' });
	public static readonly repl = new Codicon('repl', { fontCharacter: '\\ea85' });
	public static readonly zap = new Codicon('zap', { fontCharacter: '\\ea86' });
	public static readonly symbolEvent = new Codicon('symbol-event', { fontCharacter: '\\ea86' });
	public static readonly error = new Codicon('error', { fontCharacter: '\\ea87' });
	public static readonly stop = new Codicon('stop', { fontCharacter: '\\ea87' });
	public static readonly variable = new Codicon('variable', { fontCharacter: '\\ea88' });
	public static readonly symbolVariable = new Codicon('symbol-variable', { fontCharacter: '\\ea88' });
	public static readonly array = new Codicon('array', { fontCharacter: '\\ea8a' });
	public static readonly symbolArray = new Codicon('symbol-array', { fontCharacter: '\\ea8a' });
	public static readonly symbolModule = new Codicon('symbol-module', { fontCharacter: '\\ea8b' });
	public static readonly symbolPackage = new Codicon('symbol-package', { fontCharacter: '\\ea8b' });
	public static readonly symbolNamespace = new Codicon('symbol-namespace', { fontCharacter: '\\ea8b' });
	public static readonly symbolObject = new Codicon('symbol-object', { fontCharacter: '\\ea8b' });
	public static readonly symbolMethod = new Codicon('symbol-method', { fontCharacter: '\\ea8c' });
	public static readonly symbolFunction = new Codicon('symbol-function', { fontCharacter: '\\ea8c' });
	public static readonly symbolConstructor = new Codicon('symbol-constructor', { fontCharacter: '\\ea8c' });
	public static readonly symbolBoolean = new Codicon('symbol-boolean', { fontCharacter: '\\ea8f' });
	public static readonly symbolNull = new Codicon('symbol-null', { fontCharacter: '\\ea8f' });
	public static readonly symbolNumeric = new Codicon('symbol-numeric', { fontCharacter: '\\ea90' });
	public static readonly symbolNumber = new Codicon('symbol-number', { fontCharacter: '\\ea90' });
	public static readonly symbolStructure = new Codicon('symbol-structure', { fontCharacter: '\\ea91' });
	public static readonly symbolStruct = new Codicon('symbol-struct', { fontCharacter: '\\ea91' });
	public static readonly symbolParameter = new Codicon('symbol-parameter', { fontCharacter: '\\ea92' });
	public static readonly symbolTypeParameter = new Codicon('symbol-type-parameter', { fontCharacter: '\\ea92' });
	public static readonly symbolKey = new Codicon('symbol-key', { fontCharacter: '\\ea93' });
	public static readonly symbolText = new Codicon('symbol-text', { fontCharacter: '\\ea93' });
	public static readonly symbolReference = new Codicon('symbol-reference', { fontCharacter: '\\ea94' });
	public static readonly goToFile = new Codicon('go-to-file', { fontCharacter: '\\ea94' });
	public static readonly symbolEnum = new Codicon('symbol-enum', { fontCharacter: '\\ea95' });
	public static readonly symbolValue = new Codicon('symbol-value', { fontCharacter: '\\ea95' });
	public static readonly symbolRuler = new Codicon('symbol-ruler', { fontCharacter: '\\ea96' });
	public static readonly symbolUnit = new Codicon('symbol-unit', { fontCharacter: '\\ea96' });
	public static readonly activateBreakpoints = new Codicon('activate-breakpoints', { fontCharacter: '\\ea97' });
	public static readonly archive = new Codicon('archive', { fontCharacter: '\\ea98' });
	public static readonly arrowBoth = new Codicon('arrow-both', { fontCharacter: '\\ea99' });
	public static readonly arrowDown = new Codicon('arrow-down', { fontCharacter: '\\ea9a' });
	public static readonly arrowLeft = new Codicon('arrow-left', { fontCharacter: '\\ea9b' });
	public static readonly arrowRight = new Codicon('arrow-right', { fontCharacter: '\\ea9c' });
	public static readonly arrowSmallDown = new Codicon('arrow-small-down', { fontCharacter: '\\ea9d' });
	public static readonly arrowSmallLeft = new Codicon('arrow-small-left', { fontCharacter: '\\ea9e' });
	public static readonly arrowSmallRight = new Codicon('arrow-small-right', { fontCharacter: '\\ea9f' });
	public static readonly arrowSmallUp = new Codicon('arrow-small-up', { fontCharacter: '\\eaa0' });
	public static readonly arrowUp = new Codicon('arrow-up', { fontCharacter: '\\eaa1' });
	public static readonly bell = new Codicon('bell', { fontCharacter: '\\eaa2' });
	public static readonly bold = new Codicon('bold', { fontCharacter: '\\eaa3' });
	public static readonly book = new Codicon('book', { fontCharacter: '\\eaa4' });
	public static readonly bookmark = new Codicon('bookmark', { fontCharacter: '\\eaa5' });
	public static readonly debugBreakpointConditionalUnverified = new Codicon('debug-breakpoint-conditional-unverified', { fontCharacter: '\\eaa6' });
	public static readonly debugBreakpointConditional = new Codicon('debug-breakpoint-conditional', { fontCharacter: '\\eaa7' });
	public static readonly debugBreakpointConditionalDisabled = new Codicon('debug-breakpoint-conditional-disabled', { fontCharacter: '\\eaa7' });
	public static readonly debugBreakpointDataUnverified = new Codicon('debug-breakpoint-data-unverified', { fontCharacter: '\\eaa8' });
	public static readonly debugBreakpointData = new Codicon('debug-breakpoint-data', { fontCharacter: '\\eaa9' });
	public static readonly debugBreakpointDataDisabled = new Codicon('debug-breakpoint-data-disabled', { fontCharacter: '\\eaa9' });
	public static readonly debugBreakpointLogUnverified = new Codicon('debug-breakpoint-log-unverified', { fontCharacter: '\\eaaa' });
	public static readonly debugBreakpointLog = new Codicon('debug-breakpoint-log', { fontCharacter: '\\eaab' });
	public static readonly debugBreakpointLogDisabled = new Codicon('debug-breakpoint-log-disabled', { fontCharacter: '\\eaab' });
	public static readonly briefcase = new Codicon('briefcase', { fontCharacter: '\\eaac' });
	public static readonly broadcast = new Codicon('broadcast', { fontCharacter: '\\eaad' });
	public static readonly browser = new Codicon('browser', { fontCharacter: '\\eaae' });
	public static readonly bug = new Codicon('bug', { fontCharacter: '\\eaaf' });
	public static readonly calendar = new Codicon('calendar', { fontCharacter: '\\eab0' });
	public static readonly caseSensitive = new Codicon('case-sensitive', { fontCharacter: '\\eab1' });
	public static readonly check = new Codicon('check', { fontCharacter: '\\eab2' });
	public static readonly checklist = new Codicon('checklist', { fontCharacter: '\\eab3' });
	public static readonly chevronDown = new Codicon('chevron-down', { fontCharacter: '\\eab4' });
	public static readonly dropDownButton = new Codicon('drop-down-button', Codicon.chevronDown.definition);
	public static readonly chevronLeft = new Codicon('chevron-left', { fontCharacter: '\\eab5' });
	public static readonly chevronRight = new Codicon('chevron-right', { fontCharacter: '\\eab6' });
	public static readonly chevronUp = new Codicon('chevron-up', { fontCharacter: '\\eab7' });
	public static readonly chromeClose = new Codicon('chrome-close', { fontCharacter: '\\eab8' });
	public static readonly chromeMaximize = new Codicon('chrome-maximize', { fontCharacter: '\\eab9' });
	public static readonly chromeMinimize = new Codicon('chrome-minimize', { fontCharacter: '\\eaba' });
	public static readonly chromeRestore = new Codicon('chrome-restore', { fontCharacter: '\\eabb' });
	public static readonly circle = new Codicon('circle', { fontCharacter: '\\eabc' });
	public static readonly circleOutline = new Codicon('circle-outline', Codicon.circle.definition);
	public static readonly debugBreakpointUnverified = new Codicon('debug-breakpoint-unverified', Codicon.circle.definition);
	public static readonly circleSlash = new Codicon('circle-slash', { fontCharacter: '\\eabd' });
	public static readonly circuitBoard = new Codicon('circuit-board', { fontCharacter: '\\eabe' });
	public static readonly clearAll = new Codicon('clear-all', { fontCharacter: '\\eabf' });
	public static readonly clippy = new Codicon('clippy', { fontCharacter: '\\eac0' });
	public static readonly closeAll = new Codicon('close-all', { fontCharacter: '\\eac1' });
	public static readonly cloudDownload = new Codicon('cloud-download', { fontCharacter: '\\eac2' });
	public static readonly cloudUpload = new Codicon('cloud-upload', { fontCharacter: '\\eac3' });
	public static readonly code = new Codicon('code', { fontCharacter: '\\eac4' });
	public static readonly collapseAll = new Codicon('collapse-all', { fontCharacter: '\\eac5' });
	public static readonly colorMode = new Codicon('color-mode', { fontCharacter: '\\eac6' });
	public static readonly commentDiscussion = new Codicon('comment-discussion', { fontCharacter: '\\eac7' });
	public static readonly compareChanges = new Codicon('compare-changes', { fontCharacter: '\\eafd' });
	public static readonly creditCard = new Codicon('credit-card', { fontCharacter: '\\eac9' });
	public static readonly dash = new Codicon('dash', { fontCharacter: '\\eacc' });
	public static readonly dashboard = new Codicon('dashboard', { fontCharacter: '\\eacd' });
	public static readonly database = new Codicon('database', { fontCharacter: '\\eace' });
	public static readonly debugContinue = new Codicon('debug-continue', { fontCharacter: '\\eacf' });
	public static readonly debugDisconnect = new Codicon('debug-disconnect', { fontCharacter: '\\ead0' });
	public static readonly debugPause = new Codicon('debug-pause', { fontCharacter: '\\ead1' });
	public static readonly debugRestart = new Codicon('debug-restart', { fontCharacter: '\\ead2' });
	public static readonly debugStart = new Codicon('debug-start', { fontCharacter: '\\ead3' });
	public static readonly debugStepInto = new Codicon('debug-step-into', { fontCharacter: '\\ead4' });
	public static readonly debugStepOut = new Codicon('debug-step-out', { fontCharacter: '\\ead5' });
	public static readonly debugStepOver = new Codicon('debug-step-over', { fontCharacter: '\\ead6' });
	public static readonly debugStop = new Codicon('debug-stop', { fontCharacter: '\\ead7' });
	public static readonly debug = new Codicon('debug', { fontCharacter: '\\ead8' });
	public static readonly deviceCameraVideo = new Codicon('device-camera-video', { fontCharacter: '\\ead9' });
	public static readonly deviceCamera = new Codicon('device-camera', { fontCharacter: '\\eada' });
	public static readonly deviceMobile = new Codicon('device-mobile', { fontCharacter: '\\eadb' });
	public static readonly diffAdded = new Codicon('diff-added', { fontCharacter: '\\eadc' });
	public static readonly diffIgnored = new Codicon('diff-ignored', { fontCharacter: '\\eadd' });
	public static readonly diffModified = new Codicon('diff-modified', { fontCharacter: '\\eade' });
	public static readonly diffRemoved = new Codicon('diff-removed', { fontCharacter: '\\eadf' });
	public static readonly diffRenamed = new Codicon('diff-renamed', { fontCharacter: '\\eae0' });
	public static readonly diff = new Codicon('diff', { fontCharacter: '\\eae1' });
	public static readonly discard = new Codicon('discard', { fontCharacter: '\\eae2' });
	public static readonly editorLayout = new Codicon('editor-layout', { fontCharacter: '\\eae3' });
	public static readonly emptyWindow = new Codicon('empty-window', { fontCharacter: '\\eae4' });
	public static readonly exclude = new Codicon('exclude', { fontCharacter: '\\eae5' });
	public static readonly extensions = new Codicon('extensions', { fontCharacter: '\\eae6' });
	public static readonly eyeClosed = new Codicon('eye-closed', { fontCharacter: '\\eae7' });
	public static readonly fileBinary = new Codicon('file-binary', { fontCharacter: '\\eae8' });
	public static readonly fileCode = new Codicon('file-code', { fontCharacter: '\\eae9' });
	public static readonly fileMedia = new Codicon('file-media', { fontCharacter: '\\eaea' });
	public static readonly filePdf = new Codicon('file-pdf', { fontCharacter: '\\eaeb' });
	public static readonly fileSubmodule = new Codicon('file-submodule', { fontCharacter: '\\eaec' });
	public static readonly fileSymlinkDirectory = new Codicon('file-symlink-directory', { fontCharacter: '\\eaed' });
	public static readonly fileSymlinkFile = new Codicon('file-symlink-file', { fontCharacter: '\\eaee' });
	public static readonly fileZip = new Codicon('file-zip', { fontCharacter: '\\eaef' });
	public static readonly files = new Codicon('files', { fontCharacter: '\\eaf0' });
	public static readonly filter = new Codicon('filter', { fontCharacter: '\\eaf1' });
	public static readonly flame = new Codicon('flame', { fontCharacter: '\\eaf2' });
	public static readonly foldDown = new Codicon('fold-down', { fontCharacter: '\\eaf3' });
	public static readonly foldUp = new Codicon('fold-up', { fontCharacter: '\\eaf4' });
	public static readonly fold = new Codicon('fold', { fontCharacter: '\\eaf5' });
	public static readonly folderActive = new Codicon('folder-active', { fontCharacter: '\\eaf6' });
	public static readonly folderOpened = new Codicon('folder-opened', { fontCharacter: '\\eaf7' });
	public static readonly gear = new Codicon('gear', { fontCharacter: '\\eaf8' });
	public static readonly gift = new Codicon('gift', { fontCharacter: '\\eaf9' });
	public static readonly gistSecret = new Codicon('gist-secret', { fontCharacter: '\\eafa' });
	public static readonly gist = new Codicon('gist', { fontCharacter: '\\eafb' });
	public static readonly gitCommit = new Codicon('git-commit', { fontCharacter: '\\eafc' });
	public static readonly gitCompare = new Codicon('git-compare', { fontCharacter: '\\eafd' });
	public static readonly gitMerge = new Codicon('git-merge', { fontCharacter: '\\eafe' });
	public static readonly githubAction = new Codicon('github-action', { fontCharacter: '\\eaff' });
	public static readonly githubAlt = new Codicon('github-alt', { fontCharacter: '\\eb00' });
	public static readonly globe = new Codicon('globe', { fontCharacter: '\\eb01' });
	public static readonly grabber = new Codicon('grabber', { fontCharacter: '\\eb02' });
	public static readonly graph = new Codicon('graph', { fontCharacter: '\\eb03' });
	public static readonly gripper = new Codicon('gripper', { fontCharacter: '\\eb04' });
	public static readonly heart = new Codicon('heart', { fontCharacter: '\\eb05' });
	public static readonly home = new Codicon('home', { fontCharacter: '\\eb06' });
	public static readonly horizontalRule = new Codicon('horizontal-rule', { fontCharacter: '\\eb07' });
	public static readonly hubot = new Codicon('hubot', { fontCharacter: '\\eb08' });
	public static readonly inbox = new Codicon('inbox', { fontCharacter: '\\eb09' });
	public static readonly issueClosed = new Codicon('issue-closed', { fontCharacter: '\\eba4' });
	public static readonly issueReopened = new Codicon('issue-reopened', { fontCharacter: '\\eb0b' });
	public static readonly issues = new Codicon('issues', { fontCharacter: '\\eb0c' });
	public static readonly italic = new Codicon('italic', { fontCharacter: '\\eb0d' });
	public static readonly jersey = new Codicon('jersey', { fontCharacter: '\\eb0e' });
	public static readonly json = new Codicon('json', { fontCharacter: '\\eb0f' });
	public static readonly kebabVertical = new Codicon('kebab-vertical', { fontCharacter: '\\eb10' });
	public static readonly key = new Codicon('key', { fontCharacter: '\\eb11' });
	public static readonly law = new Codicon('law', { fontCharacter: '\\eb12' });
	public static readonly lightbulbAutofix = new Codicon('lightbulb-autofix', { fontCharacter: '\\eb13' });
	public static readonly linkExternal = new Codicon('link-external', { fontCharacter: '\\eb14' });
	public static readonly link = new Codicon('link', { fontCharacter: '\\eb15' });
	public static readonly listOrdered = new Codicon('list-ordered', { fontCharacter: '\\eb16' });
	public static readonly listUnordered = new Codicon('list-unordered', { fontCharacter: '\\eb17' });
	public static readonly liveShare = new Codicon('live-share', { fontCharacter: '\\eb18' });
	public static readonly loading = new Codicon('loading', { fontCharacter: '\\eb19' });
	public static readonly location = new Codicon('location', { fontCharacter: '\\eb1a' });
	public static readonly mailRead = new Codicon('mail-read', { fontCharacter: '\\eb1b' });
	public static readonly mail = new Codicon('mail', { fontCharacter: '\\eb1c' });
	public static readonly markdown = new Codicon('markdown', { fontCharacter: '\\eb1d' });
	public static readonly megaphone = new Codicon('megaphone', { fontCharacter: '\\eb1e' });
	public static readonly mention = new Codicon('mention', { fontCharacter: '\\eb1f' });
	public static readonly milestone = new Codicon('milestone', { fontCharacter: '\\eb20' });
	public static readonly mortarBoard = new Codicon('mortar-board', { fontCharacter: '\\eb21' });
	public static readonly move = new Codicon('move', { fontCharacter: '\\eb22' });
	public static readonly multipleWindows = new Codicon('multiple-windows', { fontCharacter: '\\eb23' });
	public static readonly mute = new Codicon('mute', { fontCharacter: '\\eb24' });
	public static readonly noNewline = new Codicon('no-newline', { fontCharacter: '\\eb25' });
	public static readonly note = new Codicon('note', { fontCharacter: '\\eb26' });
	public static readonly octoface = new Codicon('octoface', { fontCharacter: '\\eb27' });
	public static readonly openPreview = new Codicon('open-preview', { fontCharacter: '\\eb28' });
	public static readonly package_ = new Codicon('package', { fontCharacter: '\\eb29' });
	public static readonly paintcan = new Codicon('paintcan', { fontCharacter: '\\eb2a' });
	public static readonly pin = new Codicon('pin', { fontCharacter: '\\eb2b' });
	public static readonly play = new Codicon('play', { fontCharacter: '\\eb2c' });
	public static readonly run = new Codicon('run', { fontCharacter: '\\eb2c' });
	public static readonly plug = new Codicon('plug', { fontCharacter: '\\eb2d' });
	public static readonly preserveCase = new Codicon('preserve-case', { fontCharacter: '\\eb2e' });
	public static readonly preview = new Codicon('preview', { fontCharacter: '\\eb2f' });
	public static readonly project = new Codicon('project', { fontCharacter: '\\eb30' });
	public static readonly pulse = new Codicon('pulse', { fontCharacter: '\\eb31' });
	public static readonly question = new Codicon('question', { fontCharacter: '\\eb32' });
	public static readonly quote = new Codicon('quote', { fontCharacter: '\\eb33' });
	public static readonly radioTower = new Codicon('radio-tower', { fontCharacter: '\\eb34' });
	public static readonly reactions = new Codicon('reactions', { fontCharacter: '\\eb35' });
	public static readonly references = new Codicon('references', { fontCharacter: '\\eb36' });
	public static readonly refresh = new Codicon('refresh', { fontCharacter: '\\eb37' });
	public static readonly regex = new Codicon('regex', { fontCharacter: '\\eb38' });
	public static readonly remoteExplorer = new Codicon('remote-explorer', { fontCharacter: '\\eb39' });
	public static readonly remote = new Codicon('remote', { fontCharacter: '\\eb3a' });
	public static readonly remove = new Codicon('remove', { fontCharacter: '\\eb3b' });
	public static readonly replaceAll = new Codicon('replace-all', { fontCharacter: '\\eb3c' });
	public static readonly replace = new Codicon('replace', { fontCharacter: '\\eb3d' });
	public static readonly repoClone = new Codicon('repo-clone', { fontCharacter: '\\eb3e' });
	public static readonly repoForcePush = new Codicon('repo-force-push', { fontCharacter: '\\eb3f' });
	public static readonly repoPull = new Codicon('repo-pull', { fontCharacter: '\\eb40' });
	public static readonly repoPush = new Codicon('repo-push', { fontCharacter: '\\eb41' });
	public static readonly report = new Codicon('report', { fontCharacter: '\\eb42' });
	public static readonly requestChanges = new Codicon('request-changes', { fontCharacter: '\\eb43' });
	public static readonly rocket = new Codicon('rocket', { fontCharacter: '\\eb44' });
	public static readonly rootFolderOpened = new Codicon('root-folder-opened', { fontCharacter: '\\eb45' });
	public static readonly rootFolder = new Codicon('root-folder', { fontCharacter: '\\eb46' });
	public static readonly rss = new Codicon('rss', { fontCharacter: '\\eb47' });
	public static readonly ruby = new Codicon('ruby', { fontCharacter: '\\eb48' });
	public static readonly saveAll = new Codicon('save-all', { fontCharacter: '\\eb49' });
	public static readonly saveAs = new Codicon('save-as', { fontCharacter: '\\eb4a' });
	public static readonly save = new Codicon('save', { fontCharacter: '\\eb4b' });
	public static readonly screenFull = new Codicon('screen-full', { fontCharacter: '\\eb4c' });
	public static readonly screenNormal = new Codicon('screen-normal', { fontCharacter: '\\eb4d' });
	public static readonly searchStop = new Codicon('search-stop', { fontCharacter: '\\eb4e' });
	public static readonly server = new Codicon('server', { fontCharacter: '\\eb50' });
	public static readonly settingsGear = new Codicon('settings-gear', { fontCharacter: '\\eb51' });
	public static readonly settings = new Codicon('settings', { fontCharacter: '\\eb52' });
	public static readonly shield = new Codicon('shield', { fontCharacter: '\\eb53' });
	public static readonly smiley = new Codicon('smiley', { fontCharacter: '\\eb54' });
	public static readonly sortPrecedence = new Codicon('sort-precedence', { fontCharacter: '\\eb55' });
	public static readonly splitHorizontal = new Codicon('split-horizontal', { fontCharacter: '\\eb56' });
	public static readonly splitVertical = new Codicon('split-vertical', { fontCharacter: '\\eb57' });
	public static readonly squirrel = new Codicon('squirrel', { fontCharacter: '\\eb58' });
	public static readonly starFull = new Codicon('star-full', { fontCharacter: '\\eb59' });
	public static readonly starHalf = new Codicon('star-half', { fontCharacter: '\\eb5a' });
	public static readonly symbolClass = new Codicon('symbol-class', { fontCharacter: '\\eb5b' });
	public static readonly symbolColor = new Codicon('symbol-color', { fontCharacter: '\\eb5c' });
	public static readonly symbolCustomColor = new Codicon('symbol-customcolor', { fontCharacter: '\\eb5c' });
	public static readonly symbolConstant = new Codicon('symbol-constant', { fontCharacter: '\\eb5d' });
	public static readonly symbolEnumMember = new Codicon('symbol-enum-member', { fontCharacter: '\\eb5e' });
	public static readonly symbolField = new Codicon('symbol-field', { fontCharacter: '\\eb5f' });
	public static readonly symbolFile = new Codicon('symbol-file', { fontCharacter: '\\eb60' });
	public static readonly symbolInterface = new Codicon('symbol-interface', { fontCharacter: '\\eb61' });
	public static readonly symbolKeyword = new Codicon('symbol-keyword', { fontCharacter: '\\eb62' });
	public static readonly symbolMisc = new Codicon('symbol-misc', { fontCharacter: '\\eb63' });
	public static readonly symbolOperator = new Codicon('symbol-operator', { fontCharacter: '\\eb64' });
	public static readonly symbolProperty = new Codicon('symbol-property', { fontCharacter: '\\eb65' });
	public static readonly wrench = new Codicon('wrench', { fontCharacter: '\\eb65' });
	public static readonly wrenchSubaction = new Codicon('wrench-subaction', { fontCharacter: '\\eb65' });
	public static readonly symbolSnippet = new Codicon('symbol-snippet', { fontCharacter: '\\eb66' });
	public static readonly tasklist = new Codicon('tasklist', { fontCharacter: '\\eb67' });
	public static readonly telescope = new Codicon('telescope', { fontCharacter: '\\eb68' });
	public static readonly textSize = new Codicon('text-size', { fontCharacter: '\\eb69' });
	public static readonly threeBars = new Codicon('three-bars', { fontCharacter: '\\eb6a' });
	public static readonly thumbsdown = new Codicon('thumbsdown', { fontCharacter: '\\eb6b' });
	public static readonly thumbsup = new Codicon('thumbsup', { fontCharacter: '\\eb6c' });
	public static readonly tools = new Codicon('tools', { fontCharacter: '\\eb6d' });
	public static readonly triangleDown = new Codicon('triangle-down', { fontCharacter: '\\eb6e' });
	public static readonly triangleLeft = new Codicon('triangle-left', { fontCharacter: '\\eb6f' });
	public static readonly triangleRight = new Codicon('triangle-right', { fontCharacter: '\\eb70' });
	public static readonly triangleUp = new Codicon('triangle-up', { fontCharacter: '\\eb71' });
	public static readonly twitter = new Codicon('twitter', { fontCharacter: '\\eb72' });
	public static readonly unfold = new Codicon('unfold', { fontCharacter: '\\eb73' });
	public static readonly unlock = new Codicon('unlock', { fontCharacter: '\\eb74' });
	public static readonly unmute = new Codicon('unmute', { fontCharacter: '\\eb75' });
	public static readonly unverified = new Codicon('unverified', { fontCharacter: '\\eb76' });
	public static readonly verified = new Codicon('verified', { fontCharacter: '\\eb77' });
	public static readonly versions = new Codicon('versions', { fontCharacter: '\\eb78' });
	public static readonly vmActive = new Codicon('vm-active', { fontCharacter: '\\eb79' });
	public static readonly vmOutline = new Codicon('vm-outline', { fontCharacter: '\\eb7a' });
	public static readonly vmRunning = new Codicon('vm-running', { fontCharacter: '\\eb7b' });
	public static readonly watch = new Codicon('watch', { fontCharacter: '\\eb7c' });
	public static readonly whitespace = new Codicon('whitespace', { fontCharacter: '\\eb7d' });
	public static readonly wholeWord = new Codicon('whole-word', { fontCharacter: '\\eb7e' });
	public static readonly window = new Codicon('window', { fontCharacter: '\\eb7f' });
	public static readonly wordWrap = new Codicon('word-wrap', { fontCharacter: '\\eb80' });
	public static readonly zoomIn = new Codicon('zoom-in', { fontCharacter: '\\eb81' });
	public static readonly zoomOut = new Codicon('zoom-out', { fontCharacter: '\\eb82' });
	public static readonly listFilter = new Codicon('list-filter', { fontCharacter: '\\eb83' });
	public static readonly listFlat = new Codicon('list-flat', { fontCharacter: '\\eb84' });
	public static readonly listSelection = new Codicon('list-selection', { fontCharacter: '\\eb85' });
	public static readonly selection = new Codicon('selection', { fontCharacter: '\\eb85' });
	public static readonly listTree = new Codicon('list-tree', { fontCharacter: '\\eb86' });
	public static readonly debugBreakpointFunctionUnverified = new Codicon('debug-breakpoint-function-unverified', { fontCharacter: '\\eb87' });
	public static readonly debugBreakpointFunction = new Codicon('debug-breakpoint-function', { fontCharacter: '\\eb88' });
	public static readonly debugBreakpointFunctionDisabled = new Codicon('debug-breakpoint-function-disabled', { fontCharacter: '\\eb88' });
	public static readonly debugStackframeActive = new Codicon('debug-stackframe-active', { fontCharacter: '\\eb89' });
	public static readonly circleSmallFilled = new Codicon('circle-small-filled', { fontCharacter: '\\eb8a' });
	public static readonly debugStackframeDot = new Codicon('debug-stackframe-dot', Codicon.circleSmallFilled.definition);
	public static readonly debugStackframe = new Codicon('debug-stackframe', { fontCharacter: '\\eb8b' });
	public static readonly debugStackframeFocused = new Codicon('debug-stackframe-focused', { fontCharacter: '\\eb8b' });
	public static readonly debugBreakpointUnsupported = new Codicon('debug-breakpoint-unsupported', { fontCharacter: '\\eb8c' });
	public static readonly symbolString = new Codicon('symbol-string', { fontCharacter: '\\eb8d' });
	public static readonly debugReverseContinue = new Codicon('debug-reverse-continue', { fontCharacter: '\\eb8e' });
	public static readonly debugStepBack = new Codicon('debug-step-back', { fontCharacter: '\\eb8f' });
	public static readonly debugRestartFrame = new Codicon('debug-restart-frame', { fontCharacter: '\\eb90' });
	public static readonly callIncoming = new Codicon('call-incoming', { fontCharacter: '\\eb92' });
	public static readonly callOutgoing = new Codicon('call-outgoing', { fontCharacter: '\\eb93' });
	public static readonly menu = new Codicon('menu', { fontCharacter: '\\eb94' });
	public static readonly expandAll = new Codicon('expand-all', { fontCharacter: '\\eb95' });
	public static readonly feedback = new Codicon('feedback', { fontCharacter: '\\eb96' });
	public static readonly groupByRefType = new Codicon('group-by-ref-type', { fontCharacter: '\\eb97' });
	public static readonly ungroupByRefType = new Codicon('ungroup-by-ref-type', { fontCharacter: '\\eb98' });
	public static readonly account = new Codicon('account', { fontCharacter: '\\eb99' });
	public static readonly bellDot = new Codicon('bell-dot', { fontCharacter: '\\eb9a' });
	public static readonly debugConsole = new Codicon('debug-console', { fontCharacter: '\\eb9b' });
	public static readonly library = new Codicon('library', { fontCharacter: '\\eb9c' });
	public static readonly output = new Codicon('output', { fontCharacter: '\\eb9d' });
	public static readonly runAll = new Codicon('run-all', { fontCharacter: '\\eb9e' });
	public static readonly syncIgnored = new Codicon('sync-ignored', { fontCharacter: '\\eb9f' });
	public static readonly pinned = new Codicon('pinned', { fontCharacter: '\\eba0' });
	public static readonly githubInverted = new Codicon('github-inverted', { fontCharacter: '\\eba1' });
	public static readonly debugAlt = new Codicon('debug-alt', { fontCharacter: '\\eb91' });
	public static readonly serverProcess = new Codicon('server-process', { fontCharacter: '\\eba2' });
	public static readonly serverEnvironment = new Codicon('server-environment', { fontCharacter: '\\eba3' });
	public static readonly pass = new Codicon('pass', { fontCharacter: '\\eba4' });
	public static readonly stopCircle = new Codicon('stop-circle', { fontCharacter: '\\eba5' });
	public static readonly playCircle = new Codicon('play-circle', { fontCharacter: '\\eba6' });
	public static readonly record = new Codicon('record', { fontCharacter: '\\eba7' });
	public static readonly debugAltSmall = new Codicon('debug-alt-small', { fontCharacter: '\\eba8' });
	public static readonly vmConnect = new Codicon('vm-connect', { fontCharacter: '\\eba9' });
	public static readonly cloud = new Codicon('cloud', { fontCharacter: '\\ebaa' });
	public static readonly merge = new Codicon('merge', { fontCharacter: '\\ebab' });
	public static readonly exportIcon = new Codicon('export', { fontCharacter: '\\ebac' });
	public static readonly graphLeft = new Codicon('graph-left', { fontCharacter: '\\ebad' });
	public static readonly magnet = new Codicon('magnet', { fontCharacter: '\\ebae' });
	public static readonly notebook = new Codicon('notebook', { fontCharacter: '\\ebaf' });
	public static readonly redo = new Codicon('redo', { fontCharacter: '\\ebb0' });
	public static readonly checkAll = new Codicon('check-all', { fontCharacter: '\\ebb1' });
	public static readonly pinnedDirty = new Codicon('pinned-dirty', { fontCharacter: '\\ebb2' });
	public static readonly passFilled = new Codicon('pass-filled', { fontCharacter: '\\ebb3' });
	public static readonly circleLargeFilled = new Codicon('circle-large-filled', { fontCharacter: '\\ebb4' });
	public static readonly circleLarge = new Codicon('circle-large', { fontCharacter: '\\ebb5' });
	public static readonly circleLargeOutline = new Codicon('circle-large-outline', Codicon.circleLarge.definition);
	public static readonly combine = new Codicon('combine', { fontCharacter: '\\ebb6' });
	public static readonly gather = new Codicon('gather', { fontCharacter: '\\ebb6' });
	public static readonly table = new Codicon('table', { fontCharacter: '\\ebb7' });
	public static readonly variableGroup = new Codicon('variable-group', { fontCharacter: '\\ebb8' });
	public static readonly typeHierarchy = new Codicon('type-hierarchy', { fontCharacter: '\\ebb9' });
	public static readonly typeHierarchySub = new Codicon('type-hierarchy-sub', { fontCharacter: '\\ebba' });
	public static readonly typeHierarchySuper = new Codicon('type-hierarchy-super', { fontCharacter: '\\ebbb' });
	public static readonly gitPullRequestCreate = new Codicon('git-pull-request-create', { fontCharacter: '\\ebbc' });
	public static readonly runAbove = new Codicon('run-above', { fontCharacter: '\\ebbd' });
	public static readonly runBelow = new Codicon('run-below', { fontCharacter: '\\ebbe' });
	public static readonly notebookTemplate = new Codicon('notebook-template', { fontCharacter: '\\ebbf' });
	public static readonly debugRerun = new Codicon('debug-rerun', { fontCharacter: '\\ebc0' });
	public static readonly workspaceTrusted = new Codicon('workspace-trusted', { fontCharacter: '\\ebc1' });
	public static readonly workspaceUntrusted = new Codicon('workspace-untrusted', { fontCharacter: '\\ebc2' });
	public static readonly workspaceUnspecified = new Codicon('workspace-unspecified', { fontCharacter: '\\ebc3' });
	public static readonly terminalCmd = new Codicon('terminal-cmd', { fontCharacter: '\\ebc4' });
	public static readonly terminalDebian = new Codicon('terminal-debian', { fontCharacter: '\\ebc5' });
	public static readonly terminalLinux = new Codicon('terminal-linux', { fontCharacter: '\\ebc6' });
	public static readonly terminalPowershell = new Codicon('terminal-powershell', { fontCharacter: '\\ebc7' });
	public static readonly terminalTmux = new Codicon('terminal-tmux', { fontCharacter: '\\ebc8' });
	public static readonly terminalUbuntu = new Codicon('terminal-ubuntu', { fontCharacter: '\\ebc9' });
	public static readonly terminalBash = new Codicon('terminal-bash', { fontCharacter: '\\ebca' });
	public static readonly arrowSwap = new Codicon('arrow-swap', { fontCharacter: '\\ebcb' });
	public static readonly copy = new Codicon('copy', { fontCharacter: '\\ebcc' });
	public static readonly personAdd = new Codicon('person-add', { fontCharacter: '\\ebcd' });
	public static readonly filterFilled = new Codicon('filter-filled', { fontCharacter: '\\ebce' });
	public static readonly wand = new Codicon('wand', { fontCharacter: '\\ebcf' });
	public static readonly debugLineByLine = new Codicon('debug-line-by-line', { fontCharacter: '\\ebd0' });
	public static readonly inspect = new Codicon('inspect', { fontCharacter: '\\ebd1' });
	public static readonly layers = new Codicon('layers', { fontCharacter: '\\ebd2' });
	public static readonly layersDot = new Codicon('layers-dot', { fontCharacter: '\\ebd3' });
	public static readonly layersActive = new Codicon('layers-active', { fontCharacter: '\\ebd4' });
	public static readonly compass = new Codicon('compass', { fontCharacter: '\\ebd5' });
	public static readonly compassDot = new Codicon('compass-dot', { fontCharacter: '\\ebd6' });
	public static readonly compassActive = new Codicon('compass-active', { fontCharacter: '\\ebd7' });
	public static readonly azure = new Codicon('azure', { fontCharacter: '\\ebd8' });
	public static readonly issueDraft = new Codicon('issue-draft', { fontCharacter: '\\ebd9' });
	public static readonly gitPullRequestClosed = new Codicon('git-pull-request-closed', { fontCharacter: '\\ebda' });
	public static readonly gitPullRequestDraft = new Codicon('git-pull-request-draft', { fontCharacter: '\\ebdb' });
	public static readonly debugAll = new Codicon('debug-all', { fontCharacter: '\\ebdc' });
	public static readonly debugCoverage = new Codicon('debug-coverage', { fontCharacter: '\\ebdd' });
	public static readonly runErrors = new Codicon('run-errors', { fontCharacter: '\\ebde' });
	public static readonly folderLibrary = new Codicon('folder-library', { fontCharacter: '\\ebdf' });
	public static readonly debugContinueSmall = new Codicon('debug-continue-small', { fontCharacter: '\\ebe0' });
	public static readonly beakerStop = new Codicon('beaker-stop', { fontCharacter: '\\ebe1' });
	public static readonly graphLine = new Codicon('graph-line', { fontCharacter: '\\ebe2' });
	public static readonly graphScatter = new Codicon('graph-scatter', { fontCharacter: '\\ebe3' });
	public static readonly pieChart = new Codicon('pie-chart', { fontCharacter: '\\ebe4' });
	public static readonly bracket = new Codicon('bracket', Codicon.json.definition);
	public static readonly bracketDot = new Codicon('bracket-dot', { fontCharacter: '\\ebe5' });
	public static readonly bracketError = new Codicon('bracket-error', { fontCharacter: '\\ebe6' });
	public static readonly lockSmall = new Codicon('lock-small', { fontCharacter: '\\ebe7' });
	public static readonly azureDevops = new Codicon('azure-devops', { fontCharacter: '\\ebe8' });
	public static readonly verifiedFilled = new Codicon('verified-filled', { fontCharacter: '\\ebe9' });
	public static readonly newLine = new Codicon('newline', { fontCharacter: '\\ebea' });
	public static readonly layout = new Codicon('layout', { fontCharacter: '\\ebeb' });
	public static readonly layoutActivitybarLeft = new Codicon('layout-activitybar-left', { fontCharacter: '\\ebec' });
	public static readonly layoutActivitybarRight = new Codicon('layout-activitybar-right', { fontCharacter: '\\ebed' });
	public static readonly layoutPanelLeft = new Codicon('layout-panel-left', { fontCharacter: '\\ebee' });
	public static readonly layoutPanelCenter = new Codicon('layout-panel-center', { fontCharacter: '\\ebef' });
	public static readonly layoutPanelJustify = new Codicon('layout-panel-justify', { fontCharacter: '\\ebf0' });
	public static readonly layoutPanelRight = new Codicon('layout-panel-right', { fontCharacter: '\\ebf1' });
	public static readonly layoutPanel = new Codicon('layout-panel', { fontCharacter: '\\ebf2' });
	public static readonly layoutSidebarLeft = new Codicon('layout-sidebar-left', { fontCharacter: '\\ebf3' });
	public static readonly layoutSidebarRight = new Codicon('layout-sidebar-right', { fontCharacter: '\\ebf4' });
	public static readonly layoutStatusbar = new Codicon('layout-statusbar', { fontCharacter: '\\ebf5' });
	public static readonly layoutMenubar = new Codicon('layout-menubar', { fontCharacter: '\\ebf6' });
	public static readonly layoutCentered = new Codicon('layout-centered', { fontCharacter: '\\ebf7' });
	public static readonly layoutSidebarRightOff = new Codicon('layout-sidebar-right-off', { fontCharacter: '\\ec00' });
	public static readonly layoutPanelOff = new Codicon('layout-panel-off', { fontCharacter: '\\ec01' });
	public static readonly layoutSidebarLeftOff = new Codicon('layout-sidebar-left-off', { fontCharacter: '\\ec02' });
	public static readonly target = new Codicon('target', { fontCharacter: '\\ebf8' });
	public static readonly indent = new Codicon('indent', { fontCharacter: '\\ebf9' });
	public static readonly recordSmall = new Codicon('record-small', { fontCharacter: '\\ebfa' });
	public static readonly errorSmall = new Codicon('error-small', { fontCharacter: '\\ebfb' });
	public static readonly arrowCircleDown = new Codicon('arrow-circle-down', { fontCharacter: '\\ebfc' });
	public static readonly arrowCircleLeft = new Codicon('arrow-circle-left', { fontCharacter: '\\ebfd' });
	public static readonly arrowCircleRight = new Codicon('arrow-circle-right', { fontCharacter: '\\ebfe' });
	public static readonly arrowCircleUp = new Codicon('arrow-circle-up', { fontCharacter: '\\ebff' });
	public static readonly heartFilled = new Codicon('heart-filled', { fontCharacter: '\\ec04' });
	public static readonly map = new Codicon('map', { fontCharacter: '\\ec05' });
	public static readonly mapFilled = new Codicon('map-filled', { fontCharacter: '\\ec06' });
	public static readonly circleSmall = new Codicon('circle-small', { fontCharacter: '\\ec07' });
	public static readonly bellSlash = new Codicon('bell-slash', { fontCharacter: '\\ec08' });
	public static readonly bellSlashDot = new Codicon('bell-slash-dot', { fontCharacter: '\\ec09' });
	public static readonly commentUnresolved = new Codicon('comment-unresolved', { fontCharacter: '\\ec0a' });
	public static readonly gitPullRequestGoToChanges = new Codicon('git-pull-request-go-to-changes', { fontCharacter: '\\ec0b' });
	public static readonly gitPullRequestNewChanges = new Codicon('git-pull-request-new-changes', { fontCharacter: '\\ec0c' });
	public static readonly searchFuzzy = new Codicon('search-fuzzy', { fontCharacter: '\\ec0d' });


	// derived icons, that could become separate icons

	public static readonly dialogError = new Codicon('dialog-error', Codicon.error.definition);
	public static readonly dialogWarning = new Codicon('dialog-warning', Codicon.warning.definition);
	public static readonly dialogInfo = new Codicon('dialog-info', Codicon.info.definition);
	public static readonly dialogClose = new Codicon('dialog-close', Codicon.close.definition);

	public static readonly treeItemExpanded = new Codicon('tree-item-expanded', Codicon.chevronDown.definition); // collapsed is done with rotation

	public static readonly treeFilterOnTypeOn = new Codicon('tree-filter-on-type-on', Codicon.listFilter.definition);
	public static readonly treeFilterOnTypeOff = new Codicon('tree-filter-on-type-off', Codicon.listSelection.definition);
	public static readonly treeFilterClear = new Codicon('tree-filter-clear', Codicon.close.definition);

	public static readonly treeItemLoading = new Codicon('tree-item-loading', Codicon.loading.definition);

	public static readonly menuSelection = new Codicon('menu-selection', Codicon.check.definition);
	public static readonly menuSubmenu = new Codicon('menu-submenu', Codicon.chevronRight.definition);

	public static readonly menuBarMore = new Codicon('menubar-more', Codicon.more.definition);

	public static readonly scrollbarButtonLeft = new Codicon('scrollbar-button-left', Codicon.triangleLeft.definition);
	public static readonly scrollbarButtonRight = new Codicon('scrollbar-button-right', Codicon.triangleRight.definition);

	public static readonly scrollbarButtonUp = new Codicon('scrollbar-button-up', Codicon.triangleUp.definition);
	public static readonly scrollbarButtonDown = new Codicon('scrollbar-button-down', Codicon.triangleDown.definition);

	public static readonly toolBarMore = new Codicon('toolbar-more', Codicon.more.definition);

	public static readonly quickInputBack = new Codicon('quick-input-back', Codicon.arrowLeft.definition);
}

export function getClassNamesArray(id: string, modifier?: string) {
	const classNames = ['codicon', 'codicon-' + id];
	if (modifier) {
		classNames.push('codicon-modifier-' + modifier);
	}
	return classNames;
}

export interface CSSIcon {
	readonly id: string;
}


export namespace CSSIcon {
	export const iconNameSegment = '[A-Za-z0-9]+';
	export const iconNameExpression = '[A-Za-z0-9-]+';
	export const iconModifierExpression = '~[A-Za-z]+';
	export const iconNameCharacter = '[A-Za-z0-9~-]';

	const cssIconIdRegex = new RegExp(`^(${iconNameExpression})(${iconModifierExpression})?$`);

	export function asClassNameArray(icon: CSSIcon): string[] {
		if (icon instanceof Codicon) {
			return ['codicon', 'codicon-' + icon.id];
		}
		const match = cssIconIdRegex.exec(icon.id);
		if (!match) {
			return asClassNameArray(Codicon.error);
		}
		const [, id, modifier] = match;
		const classNames = ['codicon', 'codicon-' + id];
		if (modifier) {
			classNames.push('codicon-modifier-' + modifier.substr(1));
		}
		return classNames;
	}

	export function asClassName(icon: CSSIcon): string {
		return asClassNameArray(icon).join(' ');
	}

	export function asCSSSelector(icon: CSSIcon): string {
		return '.' + asClassNameArray(icon).join('.');
	}
}


interface IconDefinition {
	fontCharacter: string;
}
