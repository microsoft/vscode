/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

	private constructor(public readonly id: string, public readonly fontCharacter: string, public description?: string) {
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
	public static readonly add = new Codicon('add', '\\ea60');
	public static readonly plus = new Codicon('plus', Codicon.add.fontCharacter);
	public static readonly gistNew = new Codicon('gist-new', Codicon.add.fontCharacter);
	public static readonly repoCreate = new Codicon('repo-create', Codicon.add.fontCharacter);
	public static readonly lightbulb = new Codicon('lightbulb', '\\ea61');
	public static readonly lightBulb = new Codicon('light-bulb', '\\ea61');
	public static readonly repo = new Codicon('repo', '\\ea62');
	public static readonly repoDelete = new Codicon('repo-delete', '\\ea62');
	public static readonly gistFork = new Codicon('gist-fork', '\\ea63');
	public static readonly repoForked = new Codicon('repo-forked', '\\ea63');
	public static readonly gitPullRequest = new Codicon('git-pull-request', '\\ea64');
	public static readonly gitPullRequestAbandoned = new Codicon('git-pull-request-abandoned', '\\ea64');
	public static readonly recordKeys = new Codicon('record-keys', '\\ea65');
	public static readonly keyboard = new Codicon('keyboard', '\\ea65');
	public static readonly tag = new Codicon('tag', '\\ea66');
	public static readonly tagAdd = new Codicon('tag-add', '\\ea66');
	public static readonly tagRemove = new Codicon('tag-remove', '\\ea66');
	public static readonly person = new Codicon('person', '\\ea67');
	public static readonly personFollow = new Codicon('person-follow', '\\ea67');
	public static readonly personOutline = new Codicon('person-outline', '\\ea67');
	public static readonly personFilled = new Codicon('person-filled', '\\ea67');
	public static readonly gitBranch = new Codicon('git-branch', '\\ea68');
	public static readonly gitBranchCreate = new Codicon('git-branch-create', '\\ea68');
	public static readonly gitBranchDelete = new Codicon('git-branch-delete', '\\ea68');
	public static readonly sourceControl = new Codicon('source-control', '\\ea68');
	public static readonly mirror = new Codicon('mirror', '\\ea69');
	public static readonly mirrorPublic = new Codicon('mirror-public', '\\ea69');
	public static readonly star = new Codicon('star', '\\ea6a');
	public static readonly starAdd = new Codicon('star-add', '\\ea6a');
	public static readonly starDelete = new Codicon('star-delete', '\\ea6a');
	public static readonly starEmpty = new Codicon('star-empty', '\\ea6a');
	public static readonly comment = new Codicon('comment', '\\ea6b');
	public static readonly commentAdd = new Codicon('comment-add', '\\ea6b');
	public static readonly alert = new Codicon('alert', '\\ea6c');
	public static readonly warning = new Codicon('warning', '\\ea6c');
	public static readonly search = new Codicon('search', '\\ea6d');
	public static readonly searchSave = new Codicon('search-save', '\\ea6d');
	public static readonly logOut = new Codicon('log-out', '\\ea6e');
	public static readonly signOut = new Codicon('sign-out', '\\ea6e');
	public static readonly logIn = new Codicon('log-in', '\\ea6f');
	public static readonly signIn = new Codicon('sign-in', '\\ea6f');
	public static readonly eye = new Codicon('eye', '\\ea70');
	public static readonly eyeUnwatch = new Codicon('eye-unwatch', '\\ea70');
	public static readonly eyeWatch = new Codicon('eye-watch', '\\ea70');
	public static readonly circleFilled = new Codicon('circle-filled', '\\ea71');
	public static readonly primitiveDot = new Codicon('primitive-dot', Codicon.circleFilled.fontCharacter);
	public static readonly closeDirty = new Codicon('close-dirty', Codicon.circleFilled.fontCharacter);
	public static readonly debugBreakpoint = new Codicon('debug-breakpoint', Codicon.circleFilled.fontCharacter);
	public static readonly debugBreakpointDisabled = new Codicon('debug-breakpoint-disabled', Codicon.circleFilled.fontCharacter);
	public static readonly debugHint = new Codicon('debug-hint', Codicon.circleFilled.fontCharacter);
	public static readonly primitiveSquare = new Codicon('primitive-square', '\\ea72');
	public static readonly edit = new Codicon('edit', '\\ea73');
	public static readonly pencil = new Codicon('pencil', '\\ea73');
	public static readonly info = new Codicon('info', '\\ea74');
	public static readonly issueOpened = new Codicon('issue-opened', '\\ea74');
	public static readonly gistPrivate = new Codicon('gist-private', '\\ea75');
	public static readonly gitForkPrivate = new Codicon('git-fork-private', '\\ea75');
	public static readonly lock = new Codicon('lock', '\\ea75');
	public static readonly mirrorPrivate = new Codicon('mirror-private', '\\ea75');
	public static readonly close = new Codicon('close', '\\ea76');
	public static readonly removeClose = new Codicon('remove-close', '\\ea76');
	public static readonly x = new Codicon('x', '\\ea76');
	public static readonly repoSync = new Codicon('repo-sync', '\\ea77');
	public static readonly sync = new Codicon('sync', '\\ea77');
	public static readonly clone = new Codicon('clone', '\\ea78');
	public static readonly desktopDownload = new Codicon('desktop-download', '\\ea78');
	public static readonly beaker = new Codicon('beaker', '\\ea79');
	public static readonly microscope = new Codicon('microscope', '\\ea79');
	public static readonly vm = new Codicon('vm', '\\ea7a');
	public static readonly deviceDesktop = new Codicon('device-desktop', '\\ea7a');
	public static readonly file = new Codicon('file', '\\ea7b');
	public static readonly fileText = new Codicon('file-text', '\\ea7b');
	public static readonly more = new Codicon('more', '\\ea7c');
	public static readonly ellipsis = new Codicon('ellipsis', '\\ea7c');
	public static readonly kebabHorizontal = new Codicon('kebab-horizontal', '\\ea7c');
	public static readonly mailReply = new Codicon('mail-reply', '\\ea7d');
	public static readonly reply = new Codicon('reply', '\\ea7d');
	public static readonly organization = new Codicon('organization', '\\ea7e');
	public static readonly organizationFilled = new Codicon('organization-filled', '\\ea7e');
	public static readonly organizationOutline = new Codicon('organization-outline', '\\ea7e');
	public static readonly newFile = new Codicon('new-file', '\\ea7f');
	public static readonly fileAdd = new Codicon('file-add', '\\ea7f');
	public static readonly newFolder = new Codicon('new-folder', '\\ea80');
	public static readonly fileDirectoryCreate = new Codicon('file-directory-create', '\\ea80');
	public static readonly trash = new Codicon('trash', '\\ea81');
	public static readonly trashcan = new Codicon('trashcan', '\\ea81');
	public static readonly history = new Codicon('history', '\\ea82');
	public static readonly clock = new Codicon('clock', '\\ea82');
	public static readonly folder = new Codicon('folder', '\\ea83');
	public static readonly fileDirectory = new Codicon('file-directory', '\\ea83');
	public static readonly symbolFolder = new Codicon('symbol-folder', '\\ea83');
	public static readonly logoGithub = new Codicon('logo-github', '\\ea84');
	public static readonly markGithub = new Codicon('mark-github', '\\ea84');
	public static readonly github = new Codicon('github', '\\ea84');
	public static readonly terminal = new Codicon('terminal', '\\ea85');
	public static readonly console = new Codicon('console', '\\ea85');
	public static readonly repl = new Codicon('repl', '\\ea85');
	public static readonly zap = new Codicon('zap', '\\ea86');
	public static readonly symbolEvent = new Codicon('symbol-event', '\\ea86');
	public static readonly error = new Codicon('error', '\\ea87');
	public static readonly stop = new Codicon('stop', '\\ea87');
	public static readonly variable = new Codicon('variable', '\\ea88');
	public static readonly symbolVariable = new Codicon('symbol-variable', '\\ea88');
	public static readonly array = new Codicon('array', '\\ea8a');
	public static readonly symbolArray = new Codicon('symbol-array', '\\ea8a');
	public static readonly symbolModule = new Codicon('symbol-module', '\\ea8b');
	public static readonly symbolPackage = new Codicon('symbol-package', '\\ea8b');
	public static readonly symbolNamespace = new Codicon('symbol-namespace', '\\ea8b');
	public static readonly symbolObject = new Codicon('symbol-object', '\\ea8b');
	public static readonly symbolMethod = new Codicon('symbol-method', '\\ea8c');
	public static readonly symbolFunction = new Codicon('symbol-function', '\\ea8c');
	public static readonly symbolConstructor = new Codicon('symbol-constructor', '\\ea8c');
	public static readonly symbolBoolean = new Codicon('symbol-boolean', '\\ea8f');
	public static readonly symbolNull = new Codicon('symbol-null', '\\ea8f');
	public static readonly symbolNumeric = new Codicon('symbol-numeric', '\\ea90');
	public static readonly symbolNumber = new Codicon('symbol-number', '\\ea90');
	public static readonly symbolStructure = new Codicon('symbol-structure', '\\ea91');
	public static readonly symbolStruct = new Codicon('symbol-struct', '\\ea91');
	public static readonly symbolParameter = new Codicon('symbol-parameter', '\\ea92');
	public static readonly symbolTypeParameter = new Codicon('symbol-type-parameter', '\\ea92');
	public static readonly symbolKey = new Codicon('symbol-key', '\\ea93');
	public static readonly symbolText = new Codicon('symbol-text', '\\ea93');
	public static readonly symbolReference = new Codicon('symbol-reference', '\\ea94');
	public static readonly goToFile = new Codicon('go-to-file', '\\ea94');
	public static readonly symbolEnum = new Codicon('symbol-enum', '\\ea95');
	public static readonly symbolValue = new Codicon('symbol-value', '\\ea95');
	public static readonly symbolRuler = new Codicon('symbol-ruler', '\\ea96');
	public static readonly symbolUnit = new Codicon('symbol-unit', '\\ea96');
	public static readonly activateBreakpoints = new Codicon('activate-breakpoints', '\\ea97');
	public static readonly archive = new Codicon('archive', '\\ea98');
	public static readonly arrowBoth = new Codicon('arrow-both', '\\ea99');
	public static readonly arrowDown = new Codicon('arrow-down', '\\ea9a');
	public static readonly arrowLeft = new Codicon('arrow-left', '\\ea9b');
	public static readonly arrowRight = new Codicon('arrow-right', '\\ea9c');
	public static readonly arrowSmallDown = new Codicon('arrow-small-down', '\\ea9d');
	public static readonly arrowSmallLeft = new Codicon('arrow-small-left', '\\ea9e');
	public static readonly arrowSmallRight = new Codicon('arrow-small-right', '\\ea9f');
	public static readonly arrowSmallUp = new Codicon('arrow-small-up', '\\eaa0');
	public static readonly arrowUp = new Codicon('arrow-up', '\\eaa1');
	public static readonly bell = new Codicon('bell', '\\eaa2');
	public static readonly bold = new Codicon('bold', '\\eaa3');
	public static readonly book = new Codicon('book', '\\eaa4');
	public static readonly bookmark = new Codicon('bookmark', '\\eaa5');
	public static readonly debugBreakpointConditionalUnverified = new Codicon('debug-breakpoint-conditional-unverified', '\\eaa6');
	public static readonly debugBreakpointConditional = new Codicon('debug-breakpoint-conditional', '\\eaa7');
	public static readonly debugBreakpointConditionalDisabled = new Codicon('debug-breakpoint-conditional-disabled', '\\eaa7');
	public static readonly debugBreakpointDataUnverified = new Codicon('debug-breakpoint-data-unverified', '\\eaa8');
	public static readonly debugBreakpointData = new Codicon('debug-breakpoint-data', '\\eaa9');
	public static readonly debugBreakpointDataDisabled = new Codicon('debug-breakpoint-data-disabled', '\\eaa9');
	public static readonly debugBreakpointLogUnverified = new Codicon('debug-breakpoint-log-unverified', '\\eaaa');
	public static readonly debugBreakpointLog = new Codicon('debug-breakpoint-log', '\\eaab');
	public static readonly debugBreakpointLogDisabled = new Codicon('debug-breakpoint-log-disabled', '\\eaab');
	public static readonly briefcase = new Codicon('briefcase', '\\eaac');
	public static readonly broadcast = new Codicon('broadcast', '\\eaad');
	public static readonly browser = new Codicon('browser', '\\eaae');
	public static readonly bug = new Codicon('bug', '\\eaaf');
	public static readonly calendar = new Codicon('calendar', '\\eab0');
	public static readonly caseSensitive = new Codicon('case-sensitive', '\\eab1');
	public static readonly check = new Codicon('check', '\\eab2');
	public static readonly checklist = new Codicon('checklist', '\\eab3');
	public static readonly chevronDown = new Codicon('chevron-down', '\\eab4');
	public static readonly dropDownButton = new Codicon('drop-down-button', Codicon.chevronDown.fontCharacter);
	public static readonly chevronLeft = new Codicon('chevron-left', '\\eab5');
	public static readonly chevronRight = new Codicon('chevron-right', '\\eab6');
	public static readonly chevronUp = new Codicon('chevron-up', '\\eab7');
	public static readonly chromeClose = new Codicon('chrome-close', '\\eab8');
	public static readonly chromeMaximize = new Codicon('chrome-maximize', '\\eab9');
	public static readonly chromeMinimize = new Codicon('chrome-minimize', '\\eaba');
	public static readonly chromeRestore = new Codicon('chrome-restore', '\\eabb');
	public static readonly circle = new Codicon('circle', '\\eabc');
	public static readonly circleOutline = new Codicon('circle-outline', Codicon.circle.fontCharacter);
	public static readonly debugBreakpointUnverified = new Codicon('debug-breakpoint-unverified', Codicon.circle.fontCharacter);
	public static readonly circleSlash = new Codicon('circle-slash', '\\eabd');
	public static readonly circuitBoard = new Codicon('circuit-board', '\\eabe');
	public static readonly clearAll = new Codicon('clear-all', '\\eabf');
	public static readonly clippy = new Codicon('clippy', '\\eac0');
	public static readonly closeAll = new Codicon('close-all', '\\eac1');
	public static readonly cloudDownload = new Codicon('cloud-download', '\\eac2');
	public static readonly cloudUpload = new Codicon('cloud-upload', '\\eac3');
	public static readonly code = new Codicon('code', '\\eac4');
	public static readonly collapseAll = new Codicon('collapse-all', '\\eac5');
	public static readonly colorMode = new Codicon('color-mode', '\\eac6');
	public static readonly commentDiscussion = new Codicon('comment-discussion', '\\eac7');
	public static readonly compareChanges = new Codicon('compare-changes', '\\eafd');
	public static readonly creditCard = new Codicon('credit-card', '\\eac9');
	public static readonly dash = new Codicon('dash', '\\eacc');
	public static readonly dashboard = new Codicon('dashboard', '\\eacd');
	public static readonly database = new Codicon('database', '\\eace');
	public static readonly debugContinue = new Codicon('debug-continue', '\\eacf');
	public static readonly debugDisconnect = new Codicon('debug-disconnect', '\\ead0');
	public static readonly debugPause = new Codicon('debug-pause', '\\ead1');
	public static readonly debugRestart = new Codicon('debug-restart', '\\ead2');
	public static readonly debugStart = new Codicon('debug-start', '\\ead3');
	public static readonly debugStepInto = new Codicon('debug-step-into', '\\ead4');
	public static readonly debugStepOut = new Codicon('debug-step-out', '\\ead5');
	public static readonly debugStepOver = new Codicon('debug-step-over', '\\ead6');
	public static readonly debugStop = new Codicon('debug-stop', '\\ead7');
	public static readonly debug = new Codicon('debug', '\\ead8');
	public static readonly deviceCameraVideo = new Codicon('device-camera-video', '\\ead9');
	public static readonly deviceCamera = new Codicon('device-camera', '\\eada');
	public static readonly deviceMobile = new Codicon('device-mobile', '\\eadb');
	public static readonly diffAdded = new Codicon('diff-added', '\\eadc');
	public static readonly diffIgnored = new Codicon('diff-ignored', '\\eadd');
	public static readonly diffModified = new Codicon('diff-modified', '\\eade');
	public static readonly diffRemoved = new Codicon('diff-removed', '\\eadf');
	public static readonly diffRenamed = new Codicon('diff-renamed', '\\eae0');
	public static readonly diff = new Codicon('diff', '\\eae1');
	public static readonly discard = new Codicon('discard', '\\eae2');
	public static readonly editorLayout = new Codicon('editor-layout', '\\eae3');
	public static readonly emptyWindow = new Codicon('empty-window', '\\eae4');
	public static readonly exclude = new Codicon('exclude', '\\eae5');
	public static readonly extensions = new Codicon('extensions', '\\eae6');
	public static readonly eyeClosed = new Codicon('eye-closed', '\\eae7');
	public static readonly fileBinary = new Codicon('file-binary', '\\eae8');
	public static readonly fileCode = new Codicon('file-code', '\\eae9');
	public static readonly fileMedia = new Codicon('file-media', '\\eaea');
	public static readonly filePdf = new Codicon('file-pdf', '\\eaeb');
	public static readonly fileSubmodule = new Codicon('file-submodule', '\\eaec');
	public static readonly fileSymlinkDirectory = new Codicon('file-symlink-directory', '\\eaed');
	public static readonly fileSymlinkFile = new Codicon('file-symlink-file', '\\eaee');
	public static readonly fileZip = new Codicon('file-zip', '\\eaef');
	public static readonly files = new Codicon('files', '\\eaf0');
	public static readonly filter = new Codicon('filter', '\\eaf1');
	public static readonly flame = new Codicon('flame', '\\eaf2');
	public static readonly foldDown = new Codicon('fold-down', '\\eaf3');
	public static readonly foldUp = new Codicon('fold-up', '\\eaf4');
	public static readonly fold = new Codicon('fold', '\\eaf5');
	public static readonly folderActive = new Codicon('folder-active', '\\eaf6');
	public static readonly folderOpened = new Codicon('folder-opened', '\\eaf7');
	public static readonly gear = new Codicon('gear', '\\eaf8');
	public static readonly gift = new Codicon('gift', '\\eaf9');
	public static readonly gistSecret = new Codicon('gist-secret', '\\eafa');
	public static readonly gist = new Codicon('gist', '\\eafb');
	public static readonly gitCommit = new Codicon('git-commit', '\\eafc');
	public static readonly gitCompare = new Codicon('git-compare', '\\eafd');
	public static readonly gitMerge = new Codicon('git-merge', '\\eafe');
	public static readonly githubAction = new Codicon('github-action', '\\eaff');
	public static readonly githubAlt = new Codicon('github-alt', '\\eb00');
	public static readonly globe = new Codicon('globe', '\\eb01');
	public static readonly grabber = new Codicon('grabber', '\\eb02');
	public static readonly graph = new Codicon('graph', '\\eb03');
	public static readonly gripper = new Codicon('gripper', '\\eb04');
	public static readonly heart = new Codicon('heart', '\\eb05');
	public static readonly home = new Codicon('home', '\\eb06');
	public static readonly horizontalRule = new Codicon('horizontal-rule', '\\eb07');
	public static readonly hubot = new Codicon('hubot', '\\eb08');
	public static readonly inbox = new Codicon('inbox', '\\eb09');
	public static readonly issueClosed = new Codicon('issue-closed', '\\eba4');
	public static readonly issueReopened = new Codicon('issue-reopened', '\\eb0b');
	public static readonly issues = new Codicon('issues', '\\eb0c');
	public static readonly italic = new Codicon('italic', '\\eb0d');
	public static readonly jersey = new Codicon('jersey', '\\eb0e');
	public static readonly json = new Codicon('json', '\\eb0f');
	public static readonly kebabVertical = new Codicon('kebab-vertical', '\\eb10');
	public static readonly key = new Codicon('key', '\\eb11');
	public static readonly law = new Codicon('law', '\\eb12');
	public static readonly lightbulbAutofix = new Codicon('lightbulb-autofix', '\\eb13');
	public static readonly linkExternal = new Codicon('link-external', '\\eb14');
	public static readonly link = new Codicon('link', '\\eb15');
	public static readonly listOrdered = new Codicon('list-ordered', '\\eb16');
	public static readonly listUnordered = new Codicon('list-unordered', '\\eb17');
	public static readonly liveShare = new Codicon('live-share', '\\eb18');
	public static readonly loading = new Codicon('loading', '\\eb19');
	public static readonly location = new Codicon('location', '\\eb1a');
	public static readonly mailRead = new Codicon('mail-read', '\\eb1b');
	public static readonly mail = new Codicon('mail', '\\eb1c');
	public static readonly markdown = new Codicon('markdown', '\\eb1d');
	public static readonly megaphone = new Codicon('megaphone', '\\eb1e');
	public static readonly mention = new Codicon('mention', '\\eb1f');
	public static readonly milestone = new Codicon('milestone', '\\eb20');
	public static readonly mortarBoard = new Codicon('mortar-board', '\\eb21');
	public static readonly move = new Codicon('move', '\\eb22');
	public static readonly multipleWindows = new Codicon('multiple-windows', '\\eb23');
	public static readonly mute = new Codicon('mute', '\\eb24');
	public static readonly noNewline = new Codicon('no-newline', '\\eb25');
	public static readonly note = new Codicon('note', '\\eb26');
	public static readonly octoface = new Codicon('octoface', '\\eb27');
	public static readonly openPreview = new Codicon('open-preview', '\\eb28');
	public static readonly package_ = new Codicon('package', '\\eb29');
	public static readonly paintcan = new Codicon('paintcan', '\\eb2a');
	public static readonly pin = new Codicon('pin', '\\eb2b');
	public static readonly play = new Codicon('play', '\\eb2c');
	public static readonly run = new Codicon('run', '\\eb2c');
	public static readonly plug = new Codicon('plug', '\\eb2d');
	public static readonly preserveCase = new Codicon('preserve-case', '\\eb2e');
	public static readonly preview = new Codicon('preview', '\\eb2f');
	public static readonly project = new Codicon('project', '\\eb30');
	public static readonly pulse = new Codicon('pulse', '\\eb31');
	public static readonly question = new Codicon('question', '\\eb32');
	public static readonly quote = new Codicon('quote', '\\eb33');
	public static readonly radioTower = new Codicon('radio-tower', '\\eb34');
	public static readonly reactions = new Codicon('reactions', '\\eb35');
	public static readonly references = new Codicon('references', '\\eb36');
	public static readonly refresh = new Codicon('refresh', '\\eb37');
	public static readonly regex = new Codicon('regex', '\\eb38');
	public static readonly remoteExplorer = new Codicon('remote-explorer', '\\eb39');
	public static readonly remote = new Codicon('remote', '\\eb3a');
	public static readonly remove = new Codicon('remove', '\\eb3b');
	public static readonly replaceAll = new Codicon('replace-all', '\\eb3c');
	public static readonly replace = new Codicon('replace', '\\eb3d');
	public static readonly repoClone = new Codicon('repo-clone', '\\eb3e');
	public static readonly repoForcePush = new Codicon('repo-force-push', '\\eb3f');
	public static readonly repoPull = new Codicon('repo-pull', '\\eb40');
	public static readonly repoPush = new Codicon('repo-push', '\\eb41');
	public static readonly report = new Codicon('report', '\\eb42');
	public static readonly requestChanges = new Codicon('request-changes', '\\eb43');
	public static readonly rocket = new Codicon('rocket', '\\eb44');
	public static readonly rootFolderOpened = new Codicon('root-folder-opened', '\\eb45');
	public static readonly rootFolder = new Codicon('root-folder', '\\eb46');
	public static readonly rss = new Codicon('rss', '\\eb47');
	public static readonly ruby = new Codicon('ruby', '\\eb48');
	public static readonly saveAll = new Codicon('save-all', '\\eb49');
	public static readonly saveAs = new Codicon('save-as', '\\eb4a');
	public static readonly save = new Codicon('save', '\\eb4b');
	public static readonly screenFull = new Codicon('screen-full', '\\eb4c');
	public static readonly screenNormal = new Codicon('screen-normal', '\\eb4d');
	public static readonly searchStop = new Codicon('search-stop', '\\eb4e');
	public static readonly server = new Codicon('server', '\\eb50');
	public static readonly settingsGear = new Codicon('settings-gear', '\\eb51');
	public static readonly settings = new Codicon('settings', '\\eb52');
	public static readonly shield = new Codicon('shield', '\\eb53');
	public static readonly smiley = new Codicon('smiley', '\\eb54');
	public static readonly sortPrecedence = new Codicon('sort-precedence', '\\eb55');
	public static readonly splitHorizontal = new Codicon('split-horizontal', '\\eb56');
	public static readonly splitVertical = new Codicon('split-vertical', '\\eb57');
	public static readonly squirrel = new Codicon('squirrel', '\\eb58');
	public static readonly starFull = new Codicon('star-full', '\\eb59');
	public static readonly starHalf = new Codicon('star-half', '\\eb5a');
	public static readonly symbolClass = new Codicon('symbol-class', '\\eb5b');
	public static readonly symbolColor = new Codicon('symbol-color', '\\eb5c');
	public static readonly symbolCustomColor = new Codicon('symbol-customcolor', '\\eb5c');
	public static readonly symbolConstant = new Codicon('symbol-constant', '\\eb5d');
	public static readonly symbolEnumMember = new Codicon('symbol-enum-member', '\\eb5e');
	public static readonly symbolField = new Codicon('symbol-field', '\\eb5f');
	public static readonly symbolFile = new Codicon('symbol-file', '\\eb60');
	public static readonly symbolInterface = new Codicon('symbol-interface', '\\eb61');
	public static readonly symbolKeyword = new Codicon('symbol-keyword', '\\eb62');
	public static readonly symbolMisc = new Codicon('symbol-misc', '\\eb63');
	public static readonly symbolOperator = new Codicon('symbol-operator', '\\eb64');
	public static readonly symbolProperty = new Codicon('symbol-property', '\\eb65');
	public static readonly wrench = new Codicon('wrench', '\\eb65');
	public static readonly wrenchSubaction = new Codicon('wrench-subaction', '\\eb65');
	public static readonly symbolSnippet = new Codicon('symbol-snippet', '\\eb66');
	public static readonly tasklist = new Codicon('tasklist', '\\eb67');
	public static readonly telescope = new Codicon('telescope', '\\eb68');
	public static readonly textSize = new Codicon('text-size', '\\eb69');
	public static readonly threeBars = new Codicon('three-bars', '\\eb6a');
	public static readonly thumbsdown = new Codicon('thumbsdown', '\\eb6b');
	public static readonly thumbsup = new Codicon('thumbsup', '\\eb6c');
	public static readonly tools = new Codicon('tools', '\\eb6d');
	public static readonly triangleDown = new Codicon('triangle-down', '\\eb6e');
	public static readonly triangleLeft = new Codicon('triangle-left', '\\eb6f');
	public static readonly triangleRight = new Codicon('triangle-right', '\\eb70');
	public static readonly triangleUp = new Codicon('triangle-up', '\\eb71');
	public static readonly twitter = new Codicon('twitter', '\\eb72');
	public static readonly unfold = new Codicon('unfold', '\\eb73');
	public static readonly unlock = new Codicon('unlock', '\\eb74');
	public static readonly unmute = new Codicon('unmute', '\\eb75');
	public static readonly unverified = new Codicon('unverified', '\\eb76');
	public static readonly verified = new Codicon('verified', '\\eb77');
	public static readonly versions = new Codicon('versions', '\\eb78');
	public static readonly vmActive = new Codicon('vm-active', '\\eb79');
	public static readonly vmOutline = new Codicon('vm-outline', '\\eb7a');
	public static readonly vmRunning = new Codicon('vm-running', '\\eb7b');
	public static readonly watch = new Codicon('watch', '\\eb7c');
	public static readonly whitespace = new Codicon('whitespace', '\\eb7d');
	public static readonly wholeWord = new Codicon('whole-word', '\\eb7e');
	public static readonly window = new Codicon('window', '\\eb7f');
	public static readonly wordWrap = new Codicon('word-wrap', '\\eb80');
	public static readonly zoomIn = new Codicon('zoom-in', '\\eb81');
	public static readonly zoomOut = new Codicon('zoom-out', '\\eb82');
	public static readonly listFilter = new Codicon('list-filter', '\\eb83');
	public static readonly listFlat = new Codicon('list-flat', '\\eb84');
	public static readonly listSelection = new Codicon('list-selection', '\\eb85');
	public static readonly selection = new Codicon('selection', '\\eb85');
	public static readonly listTree = new Codicon('list-tree', '\\eb86');
	public static readonly debugBreakpointFunctionUnverified = new Codicon('debug-breakpoint-function-unverified', '\\eb87');
	public static readonly debugBreakpointFunction = new Codicon('debug-breakpoint-function', '\\eb88');
	public static readonly debugBreakpointFunctionDisabled = new Codicon('debug-breakpoint-function-disabled', '\\eb88');
	public static readonly debugStackframeActive = new Codicon('debug-stackframe-active', '\\eb89');
	public static readonly circleSmallFilled = new Codicon('circle-small-filled', '\\eb8a');
	public static readonly debugStackframeDot = new Codicon('debug-stackframe-dot', Codicon.circleSmallFilled.fontCharacter);
	public static readonly debugStackframe = new Codicon('debug-stackframe', '\\eb8b');
	public static readonly debugStackframeFocused = new Codicon('debug-stackframe-focused', '\\eb8b');
	public static readonly debugBreakpointUnsupported = new Codicon('debug-breakpoint-unsupported', '\\eb8c');
	public static readonly symbolString = new Codicon('symbol-string', '\\eb8d');
	public static readonly debugReverseContinue = new Codicon('debug-reverse-continue', '\\eb8e');
	public static readonly debugStepBack = new Codicon('debug-step-back', '\\eb8f');
	public static readonly debugRestartFrame = new Codicon('debug-restart-frame', '\\eb90');
	public static readonly callIncoming = new Codicon('call-incoming', '\\eb92');
	public static readonly callOutgoing = new Codicon('call-outgoing', '\\eb93');
	public static readonly menu = new Codicon('menu', '\\eb94');
	public static readonly expandAll = new Codicon('expand-all', '\\eb95');
	public static readonly feedback = new Codicon('feedback', '\\eb96');
	public static readonly groupByRefType = new Codicon('group-by-ref-type', '\\eb97');
	public static readonly ungroupByRefType = new Codicon('ungroup-by-ref-type', '\\eb98');
	public static readonly account = new Codicon('account', '\\eb99');
	public static readonly bellDot = new Codicon('bell-dot', '\\eb9a');
	public static readonly debugConsole = new Codicon('debug-console', '\\eb9b');
	public static readonly library = new Codicon('library', '\\eb9c');
	public static readonly output = new Codicon('output', '\\eb9d');
	public static readonly runAll = new Codicon('run-all', '\\eb9e');
	public static readonly syncIgnored = new Codicon('sync-ignored', '\\eb9f');
	public static readonly pinned = new Codicon('pinned', '\\eba0');
	public static readonly githubInverted = new Codicon('github-inverted', '\\eba1');
	public static readonly debugAlt = new Codicon('debug-alt', '\\eb91');
	public static readonly serverProcess = new Codicon('server-process', '\\eba2');
	public static readonly serverEnvironment = new Codicon('server-environment', '\\eba3');
	public static readonly pass = new Codicon('pass', '\\eba4');
	public static readonly stopCircle = new Codicon('stop-circle', '\\eba5');
	public static readonly playCircle = new Codicon('play-circle', '\\eba6');
	public static readonly record = new Codicon('record', '\\eba7');
	public static readonly debugAltSmall = new Codicon('debug-alt-small', '\\eba8');
	public static readonly vmConnect = new Codicon('vm-connect', '\\eba9');
	public static readonly cloud = new Codicon('cloud', '\\ebaa');
	public static readonly merge = new Codicon('merge', '\\ebab');
	public static readonly exportIcon = new Codicon('export', '\\ebac');
	public static readonly graphLeft = new Codicon('graph-left', '\\ebad');
	public static readonly magnet = new Codicon('magnet', '\\ebae');
	public static readonly notebook = new Codicon('notebook', '\\ebaf');
	public static readonly redo = new Codicon('redo', '\\ebb0');
	public static readonly checkAll = new Codicon('check-all', '\\ebb1');
	public static readonly pinnedDirty = new Codicon('pinned-dirty', '\\ebb2');
	public static readonly passFilled = new Codicon('pass-filled', '\\ebb3');
	public static readonly circleLargeFilled = new Codicon('circle-large-filled', '\\ebb4');
	public static readonly circleLarge = new Codicon('circle-large', '\\ebb5');
	public static readonly circleLargeOutline = new Codicon('circle-large-outline', Codicon.circleLarge.fontCharacter);
	public static readonly combine = new Codicon('combine', '\\ebb6');
	public static readonly gather = new Codicon('gather', '\\ebb6');
	public static readonly table = new Codicon('table', '\\ebb7');
	public static readonly variableGroup = new Codicon('variable-group', '\\ebb8');
	public static readonly typeHierarchy = new Codicon('type-hierarchy', '\\ebb9');
	public static readonly typeHierarchySub = new Codicon('type-hierarchy-sub', '\\ebba');
	public static readonly typeHierarchySuper = new Codicon('type-hierarchy-super', '\\ebbb');
	public static readonly gitPullRequestCreate = new Codicon('git-pull-request-create', '\\ebbc');
	public static readonly runAbove = new Codicon('run-above', '\\ebbd');
	public static readonly runBelow = new Codicon('run-below', '\\ebbe');
	public static readonly notebookTemplate = new Codicon('notebook-template', '\\ebbf');
	public static readonly debugRerun = new Codicon('debug-rerun', '\\ebc0');
	public static readonly workspaceTrusted = new Codicon('workspace-trusted', '\\ebc1');
	public static readonly workspaceUntrusted = new Codicon('workspace-untrusted', '\\ebc2');
	public static readonly workspaceUnspecified = new Codicon('workspace-unspecified', '\\ebc3');
	public static readonly terminalCmd = new Codicon('terminal-cmd', '\\ebc4');
	public static readonly terminalDebian = new Codicon('terminal-debian', '\\ebc5');
	public static readonly terminalLinux = new Codicon('terminal-linux', '\\ebc6');
	public static readonly terminalPowershell = new Codicon('terminal-powershell', '\\ebc7');
	public static readonly terminalTmux = new Codicon('terminal-tmux', '\\ebc8');
	public static readonly terminalUbuntu = new Codicon('terminal-ubuntu', '\\ebc9');
	public static readonly terminalBash = new Codicon('terminal-bash', '\\ebca');
	public static readonly arrowSwap = new Codicon('arrow-swap', '\\ebcb');
	public static readonly copy = new Codicon('copy', '\\ebcc');
	public static readonly personAdd = new Codicon('person-add', '\\ebcd');
	public static readonly filterFilled = new Codicon('filter-filled', '\\ebce');
	public static readonly wand = new Codicon('wand', '\\ebcf');
	public static readonly debugLineByLine = new Codicon('debug-line-by-line', '\\ebd0');
	public static readonly inspect = new Codicon('inspect', '\\ebd1');
	public static readonly layers = new Codicon('layers', '\\ebd2');
	public static readonly layersDot = new Codicon('layers-dot', '\\ebd3');
	public static readonly layersActive = new Codicon('layers-active', '\\ebd4');
	public static readonly compass = new Codicon('compass', '\\ebd5');
	public static readonly compassDot = new Codicon('compass-dot', '\\ebd6');
	public static readonly compassActive = new Codicon('compass-active', '\\ebd7');
	public static readonly azure = new Codicon('azure', '\\ebd8');
	public static readonly issueDraft = new Codicon('issue-draft', '\\ebd9');
	public static readonly gitPullRequestClosed = new Codicon('git-pull-request-closed', '\\ebda');
	public static readonly gitPullRequestDraft = new Codicon('git-pull-request-draft', '\\ebdb');
	public static readonly debugAll = new Codicon('debug-all', '\\ebdc');
	public static readonly debugCoverage = new Codicon('debug-coverage', '\\ebdd');
	public static readonly runErrors = new Codicon('run-errors', '\\ebde');
	public static readonly folderLibrary = new Codicon('folder-library', '\\ebdf');
	public static readonly debugContinueSmall = new Codicon('debug-continue-small', '\\ebe0');
	public static readonly beakerStop = new Codicon('beaker-stop', '\\ebe1');
	public static readonly graphLine = new Codicon('graph-line', '\\ebe2');
	public static readonly graphScatter = new Codicon('graph-scatter', '\\ebe3');
	public static readonly pieChart = new Codicon('pie-chart', '\\ebe4');
	public static readonly bracket = new Codicon('bracket', Codicon.json.fontCharacter);
	public static readonly bracketDot = new Codicon('bracket-dot', '\\ebe5');
	public static readonly bracketError = new Codicon('bracket-error', '\\ebe6');
	public static readonly lockSmall = new Codicon('lock-small', '\\ebe7');
	public static readonly azureDevops = new Codicon('azure-devops', '\\ebe8');
	public static readonly verifiedFilled = new Codicon('verified-filled', '\\ebe9');
	public static readonly newLine = new Codicon('newline', '\\ebea');
	public static readonly layout = new Codicon('layout', '\\ebeb');
	public static readonly layoutActivitybarLeft = new Codicon('layout-activitybar-left', '\\ebec');
	public static readonly layoutActivitybarRight = new Codicon('layout-activitybar-right', '\\ebed');
	public static readonly layoutPanelLeft = new Codicon('layout-panel-left', '\\ebee');
	public static readonly layoutPanelCenter = new Codicon('layout-panel-center', '\\ebef');
	public static readonly layoutPanelJustify = new Codicon('layout-panel-justify', '\\ebf0');
	public static readonly layoutPanelRight = new Codicon('layout-panel-right', '\\ebf1');
	public static readonly layoutPanel = new Codicon('layout-panel', '\\ebf2');
	public static readonly layoutSidebarLeft = new Codicon('layout-sidebar-left', '\\ebf3');
	public static readonly layoutSidebarRight = new Codicon('layout-sidebar-right', '\\ebf4');
	public static readonly layoutStatusbar = new Codicon('layout-statusbar', '\\ebf5');
	public static readonly layoutMenubar = new Codicon('layout-menubar', '\\ebf6');
	public static readonly layoutCentered = new Codicon('layout-centered', '\\ebf7');
	public static readonly layoutSidebarRightOff = new Codicon('layout-sidebar-right-off', '\\ec00');
	public static readonly layoutPanelOff = new Codicon('layout-panel-off', '\\ec01');
	public static readonly layoutSidebarLeftOff = new Codicon('layout-sidebar-left-off', '\\ec02');
	public static readonly target = new Codicon('target', '\\ebf8');
	public static readonly indent = new Codicon('indent', '\\ebf9');
	public static readonly recordSmall = new Codicon('record-small', '\\ebfa');
	public static readonly errorSmall = new Codicon('error-small', '\\ebfb');
	public static readonly arrowCircleDown = new Codicon('arrow-circle-down', '\\ebfc');
	public static readonly arrowCircleLeft = new Codicon('arrow-circle-left', '\\ebfd');
	public static readonly arrowCircleRight = new Codicon('arrow-circle-right', '\\ebfe');
	public static readonly arrowCircleUp = new Codicon('arrow-circle-up', '\\ebff');
	public static readonly heartFilled = new Codicon('heart-filled', '\\ec04');
	public static readonly map = new Codicon('map', '\\ec05');
	public static readonly mapFilled = new Codicon('map-filled', '\\ec06');
	public static readonly circleSmall = new Codicon('circle-small', '\\ec07');
	public static readonly bellSlash = new Codicon('bell-slash', '\\ec08');
	public static readonly bellSlashDot = new Codicon('bell-slash-dot', '\\ec09');
	public static readonly commentUnresolved = new Codicon('comment-unresolved', '\\ec0a');
	public static readonly gitPullRequestGoToChanges = new Codicon('git-pull-request-go-to-changes', '\\ec0b');
	public static readonly gitPullRequestNewChanges = new Codicon('git-pull-request-new-changes', '\\ec0c');
	public static readonly searchFuzzy = new Codicon('search-fuzzy', '\\ec0d');
	public static readonly commentDraft = new Codicon('comment-draft', '\\ec0e');


	// derived icons, that could become separate icons

	public static readonly dialogError = new Codicon('dialog-error', Codicon.error.fontCharacter);
	public static readonly dialogWarning = new Codicon('dialog-warning', Codicon.warning.fontCharacter);
	public static readonly dialogInfo = new Codicon('dialog-info', Codicon.info.fontCharacter);
	public static readonly dialogClose = new Codicon('dialog-close', Codicon.close.fontCharacter);

	public static readonly treeItemExpanded = new Codicon('tree-item-expanded', Codicon.chevronDown.fontCharacter); // collapsed is done with rotation

	public static readonly treeFilterOnTypeOn = new Codicon('tree-filter-on-type-on', Codicon.listFilter.fontCharacter);
	public static readonly treeFilterOnTypeOff = new Codicon('tree-filter-on-type-off', Codicon.listSelection.fontCharacter);
	public static readonly treeFilterClear = new Codicon('tree-filter-clear', Codicon.close.fontCharacter);

	public static readonly treeItemLoading = new Codicon('tree-item-loading', Codicon.loading.fontCharacter);

	public static readonly menuSelection = new Codicon('menu-selection', Codicon.check.fontCharacter);
	public static readonly menuSubmenu = new Codicon('menu-submenu', Codicon.chevronRight.fontCharacter);

	public static readonly menuBarMore = new Codicon('menubar-more', Codicon.more.fontCharacter);

	public static readonly scrollbarButtonLeft = new Codicon('scrollbar-button-left', Codicon.triangleLeft.fontCharacter);
	public static readonly scrollbarButtonRight = new Codicon('scrollbar-button-right', Codicon.triangleRight.fontCharacter);

	public static readonly scrollbarButtonUp = new Codicon('scrollbar-button-up', Codicon.triangleUp.fontCharacter);
	public static readonly scrollbarButtonDown = new Codicon('scrollbar-button-down', Codicon.triangleDown.fontCharacter);

	public static readonly toolBarMore = new Codicon('toolbar-more', Codicon.more.fontCharacter);

	public static readonly quickInputBack = new Codicon('quick-input-back', Codicon.arrowLeft.fontCharacter);
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
			classNames.push('codicon-modifier-' + modifier.substring(1));
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
