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

export interface ICodicon extends CSSIcon {
	readonly codiconFontCharacter: string;
	readonly description?: string;
}

const allCodicons: ICodicon[] = [];

function makeCodicon(id: string, codiconFontCharacter: string, description?: string): ICodicon {
	const codicon = { id, codiconFontCharacter, description };
	allCodicons.push(codicon);

	return codicon;
}

export function isCodicon(obj: unknown): obj is ICodicon {
	if (!obj) {
		return false;
	}

	const candidate: ICodicon = obj as ICodicon;

	return typeof candidate.id === 'string' && typeof candidate.codiconFontCharacter === 'string';
}

/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
export namespace Codicon {

	// built-in icons, with image name
	export const add = makeCodicon('add', '\\ea60');
	export const plus = makeCodicon('plus', Codicon.add.codiconFontCharacter);
	export const gistNew = makeCodicon('gist-new', Codicon.add.codiconFontCharacter);
	export const repoCreate = makeCodicon('repo-create', Codicon.add.codiconFontCharacter);
	export const lightbulb = makeCodicon('lightbulb', '\\ea61');
	export const lightBulb = makeCodicon('light-bulb', '\\ea61');
	export const repo = makeCodicon('repo', '\\ea62');
	export const repoDelete = makeCodicon('repo-delete', '\\ea62');
	export const gistFork = makeCodicon('gist-fork', '\\ea63');
	export const repoForked = makeCodicon('repo-forked', '\\ea63');
	export const gitPullRequest = makeCodicon('git-pull-request', '\\ea64');
	export const gitPullRequestAbandoned = makeCodicon('git-pull-request-abandoned', '\\ea64');
	export const recordKeys = makeCodicon('record-keys', '\\ea65');
	export const keyboard = makeCodicon('keyboard', '\\ea65');
	export const tag = makeCodicon('tag', '\\ea66');
	export const tagAdd = makeCodicon('tag-add', '\\ea66');
	export const tagRemove = makeCodicon('tag-remove', '\\ea66');
	export const person = makeCodicon('person', '\\ea67');
	export const personFollow = makeCodicon('person-follow', '\\ea67');
	export const personOutline = makeCodicon('person-outline', '\\ea67');
	export const personFilled = makeCodicon('person-filled', '\\ea67');
	export const gitBranch = makeCodicon('git-branch', '\\ea68');
	export const gitBranchCreate = makeCodicon('git-branch-create', '\\ea68');
	export const gitBranchDelete = makeCodicon('git-branch-delete', '\\ea68');
	export const sourceControl = makeCodicon('source-control', '\\ea68');
	export const mirror = makeCodicon('mirror', '\\ea69');
	export const mirrorPublic = makeCodicon('mirror-public', '\\ea69');
	export const star = makeCodicon('star', '\\ea6a');
	export const starAdd = makeCodicon('star-add', '\\ea6a');
	export const starDelete = makeCodicon('star-delete', '\\ea6a');
	export const starEmpty = makeCodicon('star-empty', '\\ea6a');
	export const comment = makeCodicon('comment', '\\ea6b');
	export const commentAdd = makeCodicon('comment-add', '\\ea6b');
	export const alert = makeCodicon('alert', '\\ea6c');
	export const warning = makeCodicon('warning', '\\ea6c');
	export const search = makeCodicon('search', '\\ea6d');
	export const searchSave = makeCodicon('search-save', '\\ea6d');
	export const logOut = makeCodicon('log-out', '\\ea6e');
	export const signOut = makeCodicon('sign-out', '\\ea6e');
	export const logIn = makeCodicon('log-in', '\\ea6f');
	export const signIn = makeCodicon('sign-in', '\\ea6f');
	export const eye = makeCodicon('eye', '\\ea70');
	export const eyeUnwatch = makeCodicon('eye-unwatch', '\\ea70');
	export const eyeWatch = makeCodicon('eye-watch', '\\ea70');
	export const circleFilled = makeCodicon('circle-filled', '\\ea71');
	export const primitiveDot = makeCodicon('primitive-dot', Codicon.circleFilled.codiconFontCharacter);
	export const closeDirty = makeCodicon('close-dirty', Codicon.circleFilled.codiconFontCharacter);
	export const debugBreakpoint = makeCodicon('debug-breakpoint', Codicon.circleFilled.codiconFontCharacter);
	export const debugBreakpointDisabled = makeCodicon('debug-breakpoint-disabled', Codicon.circleFilled.codiconFontCharacter);
	export const debugHint = makeCodicon('debug-hint', Codicon.circleFilled.codiconFontCharacter);
	export const primitiveSquare = makeCodicon('primitive-square', '\\ea72');
	export const edit = makeCodicon('edit', '\\ea73');
	export const pencil = makeCodicon('pencil', '\\ea73');
	export const info = makeCodicon('info', '\\ea74');
	export const issueOpened = makeCodicon('issue-opened', '\\ea74');
	export const gistPrivate = makeCodicon('gist-private', '\\ea75');
	export const gitForkPrivate = makeCodicon('git-fork-private', '\\ea75');
	export const lock = makeCodicon('lock', '\\ea75');
	export const mirrorPrivate = makeCodicon('mirror-private', '\\ea75');
	export const close = makeCodicon('close', '\\ea76');
	export const removeClose = makeCodicon('remove-close', '\\ea76');
	export const x = makeCodicon('x', '\\ea76');
	export const repoSync = makeCodicon('repo-sync', '\\ea77');
	export const sync = makeCodicon('sync', '\\ea77');
	export const clone = makeCodicon('clone', '\\ea78');
	export const desktopDownload = makeCodicon('desktop-download', '\\ea78');
	export const beaker = makeCodicon('beaker', '\\ea79');
	export const microscope = makeCodicon('microscope', '\\ea79');
	export const vm = makeCodicon('vm', '\\ea7a');
	export const deviceDesktop = makeCodicon('device-desktop', '\\ea7a');
	export const file = makeCodicon('file', '\\ea7b');
	export const fileText = makeCodicon('file-text', '\\ea7b');
	export const more = makeCodicon('more', '\\ea7c');
	export const ellipsis = makeCodicon('ellipsis', '\\ea7c');
	export const kebabHorizontal = makeCodicon('kebab-horizontal', '\\ea7c');
	export const mailReply = makeCodicon('mail-reply', '\\ea7d');
	export const reply = makeCodicon('reply', '\\ea7d');
	export const organization = makeCodicon('organization', '\\ea7e');
	export const organizationFilled = makeCodicon('organization-filled', '\\ea7e');
	export const organizationOutline = makeCodicon('organization-outline', '\\ea7e');
	export const newFile = makeCodicon('new-file', '\\ea7f');
	export const fileAdd = makeCodicon('file-add', '\\ea7f');
	export const newFolder = makeCodicon('new-folder', '\\ea80');
	export const fileDirectoryCreate = makeCodicon('file-directory-create', '\\ea80');
	export const trash = makeCodicon('trash', '\\ea81');
	export const trashcan = makeCodicon('trashcan', '\\ea81');
	export const history = makeCodicon('history', '\\ea82');
	export const clock = makeCodicon('clock', '\\ea82');
	export const folder = makeCodicon('folder', '\\ea83');
	export const fileDirectory = makeCodicon('file-directory', '\\ea83');
	export const symbolFolder = makeCodicon('symbol-folder', '\\ea83');
	export const logoGithub = makeCodicon('logo-github', '\\ea84');
	export const markGithub = makeCodicon('mark-github', '\\ea84');
	export const github = makeCodicon('github', '\\ea84');
	export const terminal = makeCodicon('terminal', '\\ea85');
	export const console = makeCodicon('console', '\\ea85');
	export const repl = makeCodicon('repl', '\\ea85');
	export const zap = makeCodicon('zap', '\\ea86');
	export const symbolEvent = makeCodicon('symbol-event', '\\ea86');
	export const error = makeCodicon('error', '\\ea87');
	export const stop = makeCodicon('stop', '\\ea87');
	export const variable = makeCodicon('variable', '\\ea88');
	export const symbolVariable = makeCodicon('symbol-variable', '\\ea88');
	export const array = makeCodicon('array', '\\ea8a');
	export const symbolArray = makeCodicon('symbol-array', '\\ea8a');
	export const symbolModule = makeCodicon('symbol-module', '\\ea8b');
	export const symbolPackage = makeCodicon('symbol-package', '\\ea8b');
	export const symbolNamespace = makeCodicon('symbol-namespace', '\\ea8b');
	export const symbolObject = makeCodicon('symbol-object', '\\ea8b');
	export const symbolMethod = makeCodicon('symbol-method', '\\ea8c');
	export const symbolFunction = makeCodicon('symbol-function', '\\ea8c');
	export const symbolConstructor = makeCodicon('symbol-constructor', '\\ea8c');
	export const symbolBoolean = makeCodicon('symbol-boolean', '\\ea8f');
	export const symbolNull = makeCodicon('symbol-null', '\\ea8f');
	export const symbolNumeric = makeCodicon('symbol-numeric', '\\ea90');
	export const symbolNumber = makeCodicon('symbol-number', '\\ea90');
	export const symbolStructure = makeCodicon('symbol-structure', '\\ea91');
	export const symbolStruct = makeCodicon('symbol-struct', '\\ea91');
	export const symbolParameter = makeCodicon('symbol-parameter', '\\ea92');
	export const symbolTypeParameter = makeCodicon('symbol-type-parameter', '\\ea92');
	export const symbolKey = makeCodicon('symbol-key', '\\ea93');
	export const symbolText = makeCodicon('symbol-text', '\\ea93');
	export const symbolReference = makeCodicon('symbol-reference', '\\ea94');
	export const goToFile = makeCodicon('go-to-file', '\\ea94');
	export const symbolEnum = makeCodicon('symbol-enum', '\\ea95');
	export const symbolValue = makeCodicon('symbol-value', '\\ea95');
	export const symbolRuler = makeCodicon('symbol-ruler', '\\ea96');
	export const symbolUnit = makeCodicon('symbol-unit', '\\ea96');
	export const activateBreakpoints = makeCodicon('activate-breakpoints', '\\ea97');
	export const archive = makeCodicon('archive', '\\ea98');
	export const arrowBoth = makeCodicon('arrow-both', '\\ea99');
	export const arrowDown = makeCodicon('arrow-down', '\\ea9a');
	export const arrowLeft = makeCodicon('arrow-left', '\\ea9b');
	export const arrowRight = makeCodicon('arrow-right', '\\ea9c');
	export const arrowSmallDown = makeCodicon('arrow-small-down', '\\ea9d');
	export const arrowSmallLeft = makeCodicon('arrow-small-left', '\\ea9e');
	export const arrowSmallRight = makeCodicon('arrow-small-right', '\\ea9f');
	export const arrowSmallUp = makeCodicon('arrow-small-up', '\\eaa0');
	export const arrowUp = makeCodicon('arrow-up', '\\eaa1');
	export const bell = makeCodicon('bell', '\\eaa2');
	export const bold = makeCodicon('bold', '\\eaa3');
	export const book = makeCodicon('book', '\\eaa4');
	export const bookmark = makeCodicon('bookmark', '\\eaa5');
	export const debugBreakpointConditionalUnverified = makeCodicon('debug-breakpoint-conditional-unverified', '\\eaa6');
	export const debugBreakpointConditional = makeCodicon('debug-breakpoint-conditional', '\\eaa7');
	export const debugBreakpointConditionalDisabled = makeCodicon('debug-breakpoint-conditional-disabled', '\\eaa7');
	export const debugBreakpointDataUnverified = makeCodicon('debug-breakpoint-data-unverified', '\\eaa8');
	export const debugBreakpointData = makeCodicon('debug-breakpoint-data', '\\eaa9');
	export const debugBreakpointDataDisabled = makeCodicon('debug-breakpoint-data-disabled', '\\eaa9');
	export const debugBreakpointLogUnverified = makeCodicon('debug-breakpoint-log-unverified', '\\eaaa');
	export const debugBreakpointLog = makeCodicon('debug-breakpoint-log', '\\eaab');
	export const debugBreakpointLogDisabled = makeCodicon('debug-breakpoint-log-disabled', '\\eaab');
	export const briefcase = makeCodicon('briefcase', '\\eaac');
	export const broadcast = makeCodicon('broadcast', '\\eaad');
	export const browser = makeCodicon('browser', '\\eaae');
	export const bug = makeCodicon('bug', '\\eaaf');
	export const calendar = makeCodicon('calendar', '\\eab0');
	export const caseSensitive = makeCodicon('case-sensitive', '\\eab1');
	export const check = makeCodicon('check', '\\eab2');
	export const checklist = makeCodicon('checklist', '\\eab3');
	export const chevronDown = makeCodicon('chevron-down', '\\eab4');
	export const dropDownButton = makeCodicon('drop-down-button', Codicon.chevronDown.codiconFontCharacter);
	export const chevronLeft = makeCodicon('chevron-left', '\\eab5');
	export const chevronRight = makeCodicon('chevron-right', '\\eab6');
	export const chevronUp = makeCodicon('chevron-up', '\\eab7');
	export const chromeClose = makeCodicon('chrome-close', '\\eab8');
	export const chromeMaximize = makeCodicon('chrome-maximize', '\\eab9');
	export const chromeMinimize = makeCodicon('chrome-minimize', '\\eaba');
	export const chromeRestore = makeCodicon('chrome-restore', '\\eabb');
	export const circle = makeCodicon('circle', '\\eabc');
	export const circleOutline = makeCodicon('circle-outline', Codicon.circle.codiconFontCharacter);
	export const debugBreakpointUnverified = makeCodicon('debug-breakpoint-unverified', Codicon.circle.codiconFontCharacter);
	export const circleSlash = makeCodicon('circle-slash', '\\eabd');
	export const circuitBoard = makeCodicon('circuit-board', '\\eabe');
	export const clearAll = makeCodicon('clear-all', '\\eabf');
	export const clippy = makeCodicon('clippy', '\\eac0');
	export const closeAll = makeCodicon('close-all', '\\eac1');
	export const cloudDownload = makeCodicon('cloud-download', '\\eac2');
	export const cloudUpload = makeCodicon('cloud-upload', '\\eac3');
	export const code = makeCodicon('code', '\\eac4');
	export const collapseAll = makeCodicon('collapse-all', '\\eac5');
	export const colorMode = makeCodicon('color-mode', '\\eac6');
	export const commentDiscussion = makeCodicon('comment-discussion', '\\eac7');
	export const compareChanges = makeCodicon('compare-changes', '\\eafd');
	export const creditCard = makeCodicon('credit-card', '\\eac9');
	export const dash = makeCodicon('dash', '\\eacc');
	export const dashboard = makeCodicon('dashboard', '\\eacd');
	export const database = makeCodicon('database', '\\eace');
	export const debugContinue = makeCodicon('debug-continue', '\\eacf');
	export const debugDisconnect = makeCodicon('debug-disconnect', '\\ead0');
	export const debugPause = makeCodicon('debug-pause', '\\ead1');
	export const debugRestart = makeCodicon('debug-restart', '\\ead2');
	export const debugStart = makeCodicon('debug-start', '\\ead3');
	export const debugStepInto = makeCodicon('debug-step-into', '\\ead4');
	export const debugStepOut = makeCodicon('debug-step-out', '\\ead5');
	export const debugStepOver = makeCodicon('debug-step-over', '\\ead6');
	export const debugStop = makeCodicon('debug-stop', '\\ead7');
	export const debug = makeCodicon('debug', '\\ead8');
	export const deviceCameraVideo = makeCodicon('device-camera-video', '\\ead9');
	export const deviceCamera = makeCodicon('device-camera', '\\eada');
	export const deviceMobile = makeCodicon('device-mobile', '\\eadb');
	export const diffAdded = makeCodicon('diff-added', '\\eadc');
	export const diffIgnored = makeCodicon('diff-ignored', '\\eadd');
	export const diffModified = makeCodicon('diff-modified', '\\eade');
	export const diffRemoved = makeCodicon('diff-removed', '\\eadf');
	export const diffRenamed = makeCodicon('diff-renamed', '\\eae0');
	export const diff = makeCodicon('diff', '\\eae1');
	export const discard = makeCodicon('discard', '\\eae2');
	export const editorLayout = makeCodicon('editor-layout', '\\eae3');
	export const emptyWindow = makeCodicon('empty-window', '\\eae4');
	export const exclude = makeCodicon('exclude', '\\eae5');
	export const extensions = makeCodicon('extensions', '\\eae6');
	export const eyeClosed = makeCodicon('eye-closed', '\\eae7');
	export const fileBinary = makeCodicon('file-binary', '\\eae8');
	export const fileCode = makeCodicon('file-code', '\\eae9');
	export const fileMedia = makeCodicon('file-media', '\\eaea');
	export const filePdf = makeCodicon('file-pdf', '\\eaeb');
	export const fileSubmodule = makeCodicon('file-submodule', '\\eaec');
	export const fileSymlinkDirectory = makeCodicon('file-symlink-directory', '\\eaed');
	export const fileSymlinkFile = makeCodicon('file-symlink-file', '\\eaee');
	export const fileZip = makeCodicon('file-zip', '\\eaef');
	export const files = makeCodicon('files', '\\eaf0');
	export const filter = makeCodicon('filter', '\\eaf1');
	export const flame = makeCodicon('flame', '\\eaf2');
	export const foldDown = makeCodicon('fold-down', '\\eaf3');
	export const foldUp = makeCodicon('fold-up', '\\eaf4');
	export const fold = makeCodicon('fold', '\\eaf5');
	export const folderActive = makeCodicon('folder-active', '\\eaf6');
	export const folderOpened = makeCodicon('folder-opened', '\\eaf7');
	export const gear = makeCodicon('gear', '\\eaf8');
	export const gift = makeCodicon('gift', '\\eaf9');
	export const gistSecret = makeCodicon('gist-secret', '\\eafa');
	export const gist = makeCodicon('gist', '\\eafb');
	export const gitCommit = makeCodicon('git-commit', '\\eafc');
	export const gitCompare = makeCodicon('git-compare', '\\eafd');
	export const gitMerge = makeCodicon('git-merge', '\\eafe');
	export const githubAction = makeCodicon('github-action', '\\eaff');
	export const githubAlt = makeCodicon('github-alt', '\\eb00');
	export const globe = makeCodicon('globe', '\\eb01');
	export const grabber = makeCodicon('grabber', '\\eb02');
	export const graph = makeCodicon('graph', '\\eb03');
	export const gripper = makeCodicon('gripper', '\\eb04');
	export const heart = makeCodicon('heart', '\\eb05');
	export const home = makeCodicon('home', '\\eb06');
	export const horizontalRule = makeCodicon('horizontal-rule', '\\eb07');
	export const hubot = makeCodicon('hubot', '\\eb08');
	export const inbox = makeCodicon('inbox', '\\eb09');
	export const issueClosed = makeCodicon('issue-closed', '\\eba4');
	export const issueReopened = makeCodicon('issue-reopened', '\\eb0b');
	export const issues = makeCodicon('issues', '\\eb0c');
	export const italic = makeCodicon('italic', '\\eb0d');
	export const jersey = makeCodicon('jersey', '\\eb0e');
	export const json = makeCodicon('json', '\\eb0f');
	export const kebabVertical = makeCodicon('kebab-vertical', '\\eb10');
	export const key = makeCodicon('key', '\\eb11');
	export const law = makeCodicon('law', '\\eb12');
	export const lightbulbAutofix = makeCodicon('lightbulb-autofix', '\\eb13');
	export const linkExternal = makeCodicon('link-external', '\\eb14');
	export const link = makeCodicon('link', '\\eb15');
	export const listOrdered = makeCodicon('list-ordered', '\\eb16');
	export const listUnordered = makeCodicon('list-unordered', '\\eb17');
	export const liveShare = makeCodicon('live-share', '\\eb18');
	export const loading = makeCodicon('loading', '\\eb19');
	export const location = makeCodicon('location', '\\eb1a');
	export const mailRead = makeCodicon('mail-read', '\\eb1b');
	export const mail = makeCodicon('mail', '\\eb1c');
	export const markdown = makeCodicon('markdown', '\\eb1d');
	export const megaphone = makeCodicon('megaphone', '\\eb1e');
	export const mention = makeCodicon('mention', '\\eb1f');
	export const milestone = makeCodicon('milestone', '\\eb20');
	export const mortarBoard = makeCodicon('mortar-board', '\\eb21');
	export const move = makeCodicon('move', '\\eb22');
	export const multipleWindows = makeCodicon('multiple-windows', '\\eb23');
	export const mute = makeCodicon('mute', '\\eb24');
	export const noNewline = makeCodicon('no-newline', '\\eb25');
	export const note = makeCodicon('note', '\\eb26');
	export const octoface = makeCodicon('octoface', '\\eb27');
	export const openPreview = makeCodicon('open-preview', '\\eb28');
	export const package_ = makeCodicon('package', '\\eb29');
	export const paintcan = makeCodicon('paintcan', '\\eb2a');
	export const pin = makeCodicon('pin', '\\eb2b');
	export const play = makeCodicon('play', '\\eb2c');
	export const run = makeCodicon('run', '\\eb2c');
	export const plug = makeCodicon('plug', '\\eb2d');
	export const preserveCase = makeCodicon('preserve-case', '\\eb2e');
	export const preview = makeCodicon('preview', '\\eb2f');
	export const project = makeCodicon('project', '\\eb30');
	export const pulse = makeCodicon('pulse', '\\eb31');
	export const question = makeCodicon('question', '\\eb32');
	export const quote = makeCodicon('quote', '\\eb33');
	export const radioTower = makeCodicon('radio-tower', '\\eb34');
	export const reactions = makeCodicon('reactions', '\\eb35');
	export const references = makeCodicon('references', '\\eb36');
	export const refresh = makeCodicon('refresh', '\\eb37');
	export const regex = makeCodicon('regex', '\\eb38');
	export const remoteExplorer = makeCodicon('remote-explorer', '\\eb39');
	export const remote = makeCodicon('remote', '\\eb3a');
	export const remove = makeCodicon('remove', '\\eb3b');
	export const replaceAll = makeCodicon('replace-all', '\\eb3c');
	export const replace = makeCodicon('replace', '\\eb3d');
	export const repoClone = makeCodicon('repo-clone', '\\eb3e');
	export const repoForcePush = makeCodicon('repo-force-push', '\\eb3f');
	export const repoPull = makeCodicon('repo-pull', '\\eb40');
	export const repoPush = makeCodicon('repo-push', '\\eb41');
	export const report = makeCodicon('report', '\\eb42');
	export const requestChanges = makeCodicon('request-changes', '\\eb43');
	export const rocket = makeCodicon('rocket', '\\eb44');
	export const rootFolderOpened = makeCodicon('root-folder-opened', '\\eb45');
	export const rootFolder = makeCodicon('root-folder', '\\eb46');
	export const rss = makeCodicon('rss', '\\eb47');
	export const ruby = makeCodicon('ruby', '\\eb48');
	export const saveAll = makeCodicon('save-all', '\\eb49');
	export const saveAs = makeCodicon('save-as', '\\eb4a');
	export const save = makeCodicon('save', '\\eb4b');
	export const screenFull = makeCodicon('screen-full', '\\eb4c');
	export const screenNormal = makeCodicon('screen-normal', '\\eb4d');
	export const searchStop = makeCodicon('search-stop', '\\eb4e');
	export const server = makeCodicon('server', '\\eb50');
	export const settingsGear = makeCodicon('settings-gear', '\\eb51');
	export const settings = makeCodicon('settings', '\\eb52');
	export const shield = makeCodicon('shield', '\\eb53');
	export const smiley = makeCodicon('smiley', '\\eb54');
	export const sortPrecedence = makeCodicon('sort-precedence', '\\eb55');
	export const splitHorizontal = makeCodicon('split-horizontal', '\\eb56');
	export const splitVertical = makeCodicon('split-vertical', '\\eb57');
	export const squirrel = makeCodicon('squirrel', '\\eb58');
	export const starFull = makeCodicon('star-full', '\\eb59');
	export const starHalf = makeCodicon('star-half', '\\eb5a');
	export const symbolClass = makeCodicon('symbol-class', '\\eb5b');
	export const symbolColor = makeCodicon('symbol-color', '\\eb5c');
	export const symbolCustomColor = makeCodicon('symbol-customcolor', '\\eb5c');
	export const symbolConstant = makeCodicon('symbol-constant', '\\eb5d');
	export const symbolEnumMember = makeCodicon('symbol-enum-member', '\\eb5e');
	export const symbolField = makeCodicon('symbol-field', '\\eb5f');
	export const symbolFile = makeCodicon('symbol-file', '\\eb60');
	export const symbolInterface = makeCodicon('symbol-interface', '\\eb61');
	export const symbolKeyword = makeCodicon('symbol-keyword', '\\eb62');
	export const symbolMisc = makeCodicon('symbol-misc', '\\eb63');
	export const symbolOperator = makeCodicon('symbol-operator', '\\eb64');
	export const symbolProperty = makeCodicon('symbol-property', '\\eb65');
	export const wrench = makeCodicon('wrench', '\\eb65');
	export const wrenchSubaction = makeCodicon('wrench-subaction', '\\eb65');
	export const symbolSnippet = makeCodicon('symbol-snippet', '\\eb66');
	export const tasklist = makeCodicon('tasklist', '\\eb67');
	export const telescope = makeCodicon('telescope', '\\eb68');
	export const textSize = makeCodicon('text-size', '\\eb69');
	export const threeBars = makeCodicon('three-bars', '\\eb6a');
	export const thumbsdown = makeCodicon('thumbsdown', '\\eb6b');
	export const thumbsup = makeCodicon('thumbsup', '\\eb6c');
	export const tools = makeCodicon('tools', '\\eb6d');
	export const triangleDown = makeCodicon('triangle-down', '\\eb6e');
	export const triangleLeft = makeCodicon('triangle-left', '\\eb6f');
	export const triangleRight = makeCodicon('triangle-right', '\\eb70');
	export const triangleUp = makeCodicon('triangle-up', '\\eb71');
	export const twitter = makeCodicon('twitter', '\\eb72');
	export const unfold = makeCodicon('unfold', '\\eb73');
	export const unlock = makeCodicon('unlock', '\\eb74');
	export const unmute = makeCodicon('unmute', '\\eb75');
	export const unverified = makeCodicon('unverified', '\\eb76');
	export const verified = makeCodicon('verified', '\\eb77');
	export const versions = makeCodicon('versions', '\\eb78');
	export const vmActive = makeCodicon('vm-active', '\\eb79');
	export const vmOutline = makeCodicon('vm-outline', '\\eb7a');
	export const vmRunning = makeCodicon('vm-running', '\\eb7b');
	export const watch = makeCodicon('watch', '\\eb7c');
	export const whitespace = makeCodicon('whitespace', '\\eb7d');
	export const wholeWord = makeCodicon('whole-word', '\\eb7e');
	export const window = makeCodicon('window', '\\eb7f');
	export const wordWrap = makeCodicon('word-wrap', '\\eb80');
	export const zoomIn = makeCodicon('zoom-in', '\\eb81');
	export const zoomOut = makeCodicon('zoom-out', '\\eb82');
	export const listFilter = makeCodicon('list-filter', '\\eb83');
	export const listFlat = makeCodicon('list-flat', '\\eb84');
	export const listSelection = makeCodicon('list-selection', '\\eb85');
	export const selection = makeCodicon('selection', '\\eb85');
	export const listTree = makeCodicon('list-tree', '\\eb86');
	export const debugBreakpointFunctionUnverified = makeCodicon('debug-breakpoint-function-unverified', '\\eb87');
	export const debugBreakpointFunction = makeCodicon('debug-breakpoint-function', '\\eb88');
	export const debugBreakpointFunctionDisabled = makeCodicon('debug-breakpoint-function-disabled', '\\eb88');
	export const debugStackframeActive = makeCodicon('debug-stackframe-active', '\\eb89');
	export const circleSmallFilled = makeCodicon('circle-small-filled', '\\eb8a');
	export const debugStackframeDot = makeCodicon('debug-stackframe-dot', circleSmallFilled.codiconFontCharacter);
	export const debugStackframe = makeCodicon('debug-stackframe', '\\eb8b');
	export const debugStackframeFocused = makeCodicon('debug-stackframe-focused', '\\eb8b');
	export const debugBreakpointUnsupported = makeCodicon('debug-breakpoint-unsupported', '\\eb8c');
	export const symbolString = makeCodicon('symbol-string', '\\eb8d');
	export const debugReverseContinue = makeCodicon('debug-reverse-continue', '\\eb8e');
	export const debugStepBack = makeCodicon('debug-step-back', '\\eb8f');
	export const debugRestartFrame = makeCodicon('debug-restart-frame', '\\eb90');
	export const callIncoming = makeCodicon('call-incoming', '\\eb92');
	export const callOutgoing = makeCodicon('call-outgoing', '\\eb93');
	export const menu = makeCodicon('menu', '\\eb94');
	export const expandAll = makeCodicon('expand-all', '\\eb95');
	export const feedback = makeCodicon('feedback', '\\eb96');
	export const groupByRefType = makeCodicon('group-by-ref-type', '\\eb97');
	export const ungroupByRefType = makeCodicon('ungroup-by-ref-type', '\\eb98');
	export const account = makeCodicon('account', '\\eb99');
	export const bellDot = makeCodicon('bell-dot', '\\eb9a');
	export const debugConsole = makeCodicon('debug-console', '\\eb9b');
	export const library = makeCodicon('library', '\\eb9c');
	export const output = makeCodicon('output', '\\eb9d');
	export const runAll = makeCodicon('run-all', '\\eb9e');
	export const syncIgnored = makeCodicon('sync-ignored', '\\eb9f');
	export const pinned = makeCodicon('pinned', '\\eba0');
	export const githubInverted = makeCodicon('github-inverted', '\\eba1');
	export const debugAlt = makeCodicon('debug-alt', '\\eb91');
	export const serverProcess = makeCodicon('server-process', '\\eba2');
	export const serverEnvironment = makeCodicon('server-environment', '\\eba3');
	export const pass = makeCodicon('pass', '\\eba4');
	export const stopCircle = makeCodicon('stop-circle', '\\eba5');
	export const playCircle = makeCodicon('play-circle', '\\eba6');
	export const record = makeCodicon('record', '\\eba7');
	export const debugAltSmall = makeCodicon('debug-alt-small', '\\eba8');
	export const vmConnect = makeCodicon('vm-connect', '\\eba9');
	export const cloud = makeCodicon('cloud', '\\ebaa');
	export const merge = makeCodicon('merge', '\\ebab');
	export const exportIcon = makeCodicon('export', '\\ebac');
	export const graphLeft = makeCodicon('graph-left', '\\ebad');
	export const magnet = makeCodicon('magnet', '\\ebae');
	export const notebook = makeCodicon('notebook', '\\ebaf');
	export const redo = makeCodicon('redo', '\\ebb0');
	export const checkAll = makeCodicon('check-all', '\\ebb1');
	export const pinnedDirty = makeCodicon('pinned-dirty', '\\ebb2');
	export const passFilled = makeCodicon('pass-filled', '\\ebb3');
	export const circleLargeFilled = makeCodicon('circle-large-filled', '\\ebb4');
	export const circleLarge = makeCodicon('circle-large', '\\ebb5');
	export const circleLargeOutline = makeCodicon('circle-large-outline', circleLarge.codiconFontCharacter);
	export const combine = makeCodicon('combine', '\\ebb6');
	export const gather = makeCodicon('gather', '\\ebb6');
	export const table = makeCodicon('table', '\\ebb7');
	export const variableGroup = makeCodicon('variable-group', '\\ebb8');
	export const typeHierarchy = makeCodicon('type-hierarchy', '\\ebb9');
	export const typeHierarchySub = makeCodicon('type-hierarchy-sub', '\\ebba');
	export const typeHierarchySuper = makeCodicon('type-hierarchy-super', '\\ebbb');
	export const gitPullRequestCreate = makeCodicon('git-pull-request-create', '\\ebbc');
	export const runAbove = makeCodicon('run-above', '\\ebbd');
	export const runBelow = makeCodicon('run-below', '\\ebbe');
	export const notebookTemplate = makeCodicon('notebook-template', '\\ebbf');
	export const debugRerun = makeCodicon('debug-rerun', '\\ebc0');
	export const workspaceTrusted = makeCodicon('workspace-trusted', '\\ebc1');
	export const workspaceUntrusted = makeCodicon('workspace-untrusted', '\\ebc2');
	export const workspaceUnspecified = makeCodicon('workspace-unspecified', '\\ebc3');
	export const terminalCmd = makeCodicon('terminal-cmd', '\\ebc4');
	export const terminalDebian = makeCodicon('terminal-debian', '\\ebc5');
	export const terminalLinux = makeCodicon('terminal-linux', '\\ebc6');
	export const terminalPowershell = makeCodicon('terminal-powershell', '\\ebc7');
	export const terminalTmux = makeCodicon('terminal-tmux', '\\ebc8');
	export const terminalUbuntu = makeCodicon('terminal-ubuntu', '\\ebc9');
	export const terminalBash = makeCodicon('terminal-bash', '\\ebca');
	export const arrowSwap = makeCodicon('arrow-swap', '\\ebcb');
	export const copy = makeCodicon('copy', '\\ebcc');
	export const personAdd = makeCodicon('person-add', '\\ebcd');
	export const filterFilled = makeCodicon('filter-filled', '\\ebce');
	export const wand = makeCodicon('wand', '\\ebcf');
	export const debugLineByLine = makeCodicon('debug-line-by-line', '\\ebd0');
	export const inspect = makeCodicon('inspect', '\\ebd1');
	export const layers = makeCodicon('layers', '\\ebd2');
	export const layersDot = makeCodicon('layers-dot', '\\ebd3');
	export const layersActive = makeCodicon('layers-active', '\\ebd4');
	export const compass = makeCodicon('compass', '\\ebd5');
	export const compassDot = makeCodicon('compass-dot', '\\ebd6');
	export const compassActive = makeCodicon('compass-active', '\\ebd7');
	export const azure = makeCodicon('azure', '\\ebd8');
	export const issueDraft = makeCodicon('issue-draft', '\\ebd9');
	export const gitPullRequestClosed = makeCodicon('git-pull-request-closed', '\\ebda');
	export const gitPullRequestDraft = makeCodicon('git-pull-request-draft', '\\ebdb');
	export const debugAll = makeCodicon('debug-all', '\\ebdc');
	export const debugCoverage = makeCodicon('debug-coverage', '\\ebdd');
	export const runErrors = makeCodicon('run-errors', '\\ebde');
	export const folderLibrary = makeCodicon('folder-library', '\\ebdf');
	export const debugContinueSmall = makeCodicon('debug-continue-small', '\\ebe0');
	export const beakerStop = makeCodicon('beaker-stop', '\\ebe1');
	export const graphLine = makeCodicon('graph-line', '\\ebe2');
	export const graphScatter = makeCodicon('graph-scatter', '\\ebe3');
	export const pieChart = makeCodicon('pie-chart', '\\ebe4');
	export const bracket = makeCodicon('bracket', json.codiconFontCharacter);
	export const bracketDot = makeCodicon('bracket-dot', '\\ebe5');
	export const bracketError = makeCodicon('bracket-error', '\\ebe6');
	export const lockSmall = makeCodicon('lock-small', '\\ebe7');
	export const azureDevops = makeCodicon('azure-devops', '\\ebe8');
	export const verifiedFilled = makeCodicon('verified-filled', '\\ebe9');
	export const newLine = makeCodicon('newline', '\\ebea');
	export const layout = makeCodicon('layout', '\\ebeb');
	export const layoutActivitybarLeft = makeCodicon('layout-activitybar-left', '\\ebec');
	export const layoutActivitybarRight = makeCodicon('layout-activitybar-right', '\\ebed');
	export const layoutPanelLeft = makeCodicon('layout-panel-left', '\\ebee');
	export const layoutPanelCenter = makeCodicon('layout-panel-center', '\\ebef');
	export const layoutPanelJustify = makeCodicon('layout-panel-justify', '\\ebf0');
	export const layoutPanelRight = makeCodicon('layout-panel-right', '\\ebf1');
	export const layoutPanel = makeCodicon('layout-panel', '\\ebf2');
	export const layoutSidebarLeft = makeCodicon('layout-sidebar-left', '\\ebf3');
	export const layoutSidebarRight = makeCodicon('layout-sidebar-right', '\\ebf4');
	export const layoutStatusbar = makeCodicon('layout-statusbar', '\\ebf5');
	export const layoutMenubar = makeCodicon('layout-menubar', '\\ebf6');
	export const layoutCentered = makeCodicon('layout-centered', '\\ebf7');
	export const layoutSidebarRightOff = makeCodicon('layout-sidebar-right-off', '\\ec00');
	export const layoutPanelOff = makeCodicon('layout-panel-off', '\\ec01');
	export const layoutSidebarLeftOff = makeCodicon('layout-sidebar-left-off', '\\ec02');
	export const target = makeCodicon('target', '\\ebf8');
	export const indent = makeCodicon('indent', '\\ebf9');
	export const recordSmall = makeCodicon('record-small', '\\ebfa');
	export const errorSmall = makeCodicon('error-small', '\\ebfb');
	export const arrowCircleDown = makeCodicon('arrow-circle-down', '\\ebfc');
	export const arrowCircleLeft = makeCodicon('arrow-circle-left', '\\ebfd');
	export const arrowCircleRight = makeCodicon('arrow-circle-right', '\\ebfe');
	export const arrowCircleUp = makeCodicon('arrow-circle-up', '\\ebff');
	export const heartFilled = makeCodicon('heart-filled', '\\ec04');
	export const map = makeCodicon('map', '\\ec05');
	export const mapFilled = makeCodicon('map-filled', '\\ec06');
	export const circleSmall = makeCodicon('circle-small', '\\ec07');
	export const bellSlash = makeCodicon('bell-slash', '\\ec08');
	export const bellSlashDot = makeCodicon('bell-slash-dot', '\\ec09');
	export const commentUnresolved = makeCodicon('comment-unresolved', '\\ec0a');
	export const gitPullRequestGoToChanges = makeCodicon('git-pull-request-go-to-changes', '\\ec0b');
	export const gitPullRequestNewChanges = makeCodicon('git-pull-request-new-changes', '\\ec0c');
	export const searchFuzzy = makeCodicon('search-fuzzy', '\\ec0d');
	export const commentDraft = makeCodicon('comment-draft', '\\ec0e');


	// derived icons, that could become separate icons

	export const dialogError = makeCodicon('dialog-error', error.codiconFontCharacter);
	export const dialogWarning = makeCodicon('dialog-warning', warning.codiconFontCharacter);
	export const dialogInfo = makeCodicon('dialog-info', info.codiconFontCharacter);
	export const dialogClose = makeCodicon('dialog-close', close.codiconFontCharacter);

	export const treeItemExpanded = makeCodicon('tree-item-expanded', chevronDown.codiconFontCharacter); // collapsed is done with rotation

	export const treeFilterOnTypeOn = makeCodicon('tree-filter-on-type-on', listFilter.codiconFontCharacter);
	export const treeFilterOnTypeOff = makeCodicon('tree-filter-on-type-off', listSelection.codiconFontCharacter);
	export const treeFilterClear = makeCodicon('tree-filter-clear', close.codiconFontCharacter);

	export const treeItemLoading = makeCodicon('tree-item-loading', loading.codiconFontCharacter);

	export const menuSelection = makeCodicon('menu-selection', check.codiconFontCharacter);
	export const menuSubmenu = makeCodicon('menu-submenu', chevronRight.codiconFontCharacter);

	export const menuBarMore = makeCodicon('menubar-more', more.codiconFontCharacter);

	export const scrollbarButtonLeft = makeCodicon('scrollbar-button-left', triangleLeft.codiconFontCharacter);
	export const scrollbarButtonRight = makeCodicon('scrollbar-button-right', triangleRight.codiconFontCharacter);

	export const scrollbarButtonUp = makeCodicon('scrollbar-button-up', triangleUp.codiconFontCharacter);
	export const scrollbarButtonDown = makeCodicon('scrollbar-button-down', triangleDown.codiconFontCharacter);

	export const toolBarMore = makeCodicon('toolbar-more', more.codiconFontCharacter);

	export const quickInputBack = makeCodicon('quick-input-back', arrowLeft.codiconFontCharacter);

	/**
	 * @returns Returns all default icons covered by the codicon font. Only to be used by the icon registry in platform.
	 */
	export function getAll(): ICodicon[] {
		return allCodicons;
	}

	export function classNames(codicon: ICodicon): string {
		return 'codicon codicon-' + codicon.id;
	}

	export function classNamesArray(codicon: ICodicon): string[] {
		return ['codicon', 'codicon-' + codicon.id];
	}

	export function cssSelector(codicon: ICodicon): string {
		return '.codicon.codicon-' + codicon.id;
	}
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
		if (isCodicon(icon)) {
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
