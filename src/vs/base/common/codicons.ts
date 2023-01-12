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

interface Codicon extends CSSIcon {
	fontCharacter: string;
}

function newCodicon(id: string, fontCharacter: string) {
	const icon = { id, fontCharacter };
	Codicon._allCodicons.push(icon);
	return icon;
}

/**
 * The Codicon library is a set of default icons that are built-in in VS Code.
 *
 * In the product (outside of base) Codicons should only be used as defaults. In order to have all icons in VS Code
 * themeable, component should define new, UI component specific icons using `iconRegistry.registerIcon`.
 * In that call a Codicon can be named as default.
 */
export namespace Codicon {

	// registry
	export const _allCodicons: Codicon[] = [];

	/**
	 * @returns Returns all default icons covered by the codicon font. Only to be used by the icon registry in platform.
	 */
	export function getAll(): readonly Codicon[] {
		return Codicon._allCodicons;
	}

	// built-in icons, with image name
	export const add = newCodicon('add', '\\ea60');
	export const plus = newCodicon('plus', Codicon.add.fontCharacter);
	export const gistNew = newCodicon('gist-new', Codicon.add.fontCharacter);
	export const repoCreate = newCodicon('repo-create', Codicon.add.fontCharacter);
	export const lightbulb = newCodicon('lightbulb', '\\ea61');
	export const lightBulb = newCodicon('light-bulb', '\\ea61');
	export const repo = newCodicon('repo', '\\ea62');
	export const repoDelete = newCodicon('repo-delete', '\\ea62');
	export const gistFork = newCodicon('gist-fork', '\\ea63');
	export const repoForked = newCodicon('repo-forked', '\\ea63');
	export const gitPullRequest = newCodicon('git-pull-request', '\\ea64');
	export const gitPullRequestAbandoned = newCodicon('git-pull-request-abandoned', '\\ea64');
	export const recordKeys = newCodicon('record-keys', '\\ea65');
	export const keyboard = newCodicon('keyboard', '\\ea65');
	export const tag = newCodicon('tag', '\\ea66');
	export const tagAdd = newCodicon('tag-add', '\\ea66');
	export const tagRemove = newCodicon('tag-remove', '\\ea66');
	export const person = newCodicon('person', '\\ea67');
	export const personFollow = newCodicon('person-follow', '\\ea67');
	export const personOutline = newCodicon('person-outline', '\\ea67');
	export const personFilled = newCodicon('person-filled', '\\ea67');
	export const gitBranch = newCodicon('git-branch', '\\ea68');
	export const gitBranchCreate = newCodicon('git-branch-create', '\\ea68');
	export const gitBranchDelete = newCodicon('git-branch-delete', '\\ea68');
	export const sourceControl = newCodicon('source-control', '\\ea68');
	export const mirror = newCodicon('mirror', '\\ea69');
	export const mirrorPublic = newCodicon('mirror-public', '\\ea69');
	export const star = newCodicon('star', '\\ea6a');
	export const starAdd = newCodicon('star-add', '\\ea6a');
	export const starDelete = newCodicon('star-delete', '\\ea6a');
	export const starEmpty = newCodicon('star-empty', '\\ea6a');
	export const comment = newCodicon('comment', '\\ea6b');
	export const commentAdd = newCodicon('comment-add', '\\ea6b');
	export const alert = newCodicon('alert', '\\ea6c');
	export const warning = newCodicon('warning', '\\ea6c');
	export const search = newCodicon('search', '\\ea6d');
	export const searchSave = newCodicon('search-save', '\\ea6d');
	export const logOut = newCodicon('log-out', '\\ea6e');
	export const signOut = newCodicon('sign-out', '\\ea6e');
	export const logIn = newCodicon('log-in', '\\ea6f');
	export const signIn = newCodicon('sign-in', '\\ea6f');
	export const eye = newCodicon('eye', '\\ea70');
	export const eyeUnwatch = newCodicon('eye-unwatch', '\\ea70');
	export const eyeWatch = newCodicon('eye-watch', '\\ea70');
	export const circleFilled = newCodicon('circle-filled', '\\ea71');
	export const primitiveDot = newCodicon('primitive-dot', Codicon.circleFilled.fontCharacter);
	export const closeDirty = newCodicon('close-dirty', Codicon.circleFilled.fontCharacter);
	export const debugBreakpoint = newCodicon('debug-breakpoint', Codicon.circleFilled.fontCharacter);
	export const debugBreakpointDisabled = newCodicon('debug-breakpoint-disabled', Codicon.circleFilled.fontCharacter);
	export const debugHint = newCodicon('debug-hint', Codicon.circleFilled.fontCharacter);
	export const primitiveSquare = newCodicon('primitive-square', '\\ea72');
	export const edit = newCodicon('edit', '\\ea73');
	export const pencil = newCodicon('pencil', '\\ea73');
	export const info = newCodicon('info', '\\ea74');
	export const issueOpened = newCodicon('issue-opened', '\\ea74');
	export const gistPrivate = newCodicon('gist-private', '\\ea75');
	export const gitForkPrivate = newCodicon('git-fork-private', '\\ea75');
	export const lock = newCodicon('lock', '\\ea75');
	export const mirrorPrivate = newCodicon('mirror-private', '\\ea75');
	export const close = newCodicon('close', '\\ea76');
	export const removeClose = newCodicon('remove-close', '\\ea76');
	export const x = newCodicon('x', '\\ea76');
	export const repoSync = newCodicon('repo-sync', '\\ea77');
	export const sync = newCodicon('sync', '\\ea77');
	export const clone = newCodicon('clone', '\\ea78');
	export const desktopDownload = newCodicon('desktop-download', '\\ea78');
	export const beaker = newCodicon('beaker', '\\ea79');
	export const microscope = newCodicon('microscope', '\\ea79');
	export const vm = newCodicon('vm', '\\ea7a');
	export const deviceDesktop = newCodicon('device-desktop', '\\ea7a');
	export const file = newCodicon('file', '\\ea7b');
	export const fileText = newCodicon('file-text', '\\ea7b');
	export const more = newCodicon('more', '\\ea7c');
	export const ellipsis = newCodicon('ellipsis', '\\ea7c');
	export const kebabHorizontal = newCodicon('kebab-horizontal', '\\ea7c');
	export const mailReply = newCodicon('mail-reply', '\\ea7d');
	export const reply = newCodicon('reply', '\\ea7d');
	export const organization = newCodicon('organization', '\\ea7e');
	export const organizationFilled = newCodicon('organization-filled', '\\ea7e');
	export const organizationOutline = newCodicon('organization-outline', '\\ea7e');
	export const newFile = newCodicon('new-file', '\\ea7f');
	export const fileAdd = newCodicon('file-add', '\\ea7f');
	export const newFolder = newCodicon('new-folder', '\\ea80');
	export const fileDirectoryCreate = newCodicon('file-directory-create', '\\ea80');
	export const trash = newCodicon('trash', '\\ea81');
	export const trashcan = newCodicon('trashcan', '\\ea81');
	export const history = newCodicon('history', '\\ea82');
	export const clock = newCodicon('clock', '\\ea82');
	export const folder = newCodicon('folder', '\\ea83');
	export const fileDirectory = newCodicon('file-directory', '\\ea83');
	export const symbolFolder = newCodicon('symbol-folder', '\\ea83');
	export const logoGithub = newCodicon('logo-github', '\\ea84');
	export const markGithub = newCodicon('mark-github', '\\ea84');
	export const github = newCodicon('github', '\\ea84');
	export const terminal = newCodicon('terminal', '\\ea85');
	export const console = newCodicon('console', '\\ea85');
	export const repl = newCodicon('repl', '\\ea85');
	export const zap = newCodicon('zap', '\\ea86');
	export const symbolEvent = newCodicon('symbol-event', '\\ea86');
	export const error = newCodicon('error', '\\ea87');
	export const stop = newCodicon('stop', '\\ea87');
	export const variable = newCodicon('variable', '\\ea88');
	export const symbolVariable = newCodicon('symbol-variable', '\\ea88');
	export const array = newCodicon('array', '\\ea8a');
	export const symbolArray = newCodicon('symbol-array', '\\ea8a');
	export const symbolModule = newCodicon('symbol-module', '\\ea8b');
	export const symbolPackage = newCodicon('symbol-package', '\\ea8b');
	export const symbolNamespace = newCodicon('symbol-namespace', '\\ea8b');
	export const symbolObject = newCodicon('symbol-object', '\\ea8b');
	export const symbolMethod = newCodicon('symbol-method', '\\ea8c');
	export const symbolFunction = newCodicon('symbol-function', '\\ea8c');
	export const symbolConstructor = newCodicon('symbol-constructor', '\\ea8c');
	export const symbolBoolean = newCodicon('symbol-boolean', '\\ea8f');
	export const symbolNull = newCodicon('symbol-null', '\\ea8f');
	export const symbolNumeric = newCodicon('symbol-numeric', '\\ea90');
	export const symbolNumber = newCodicon('symbol-number', '\\ea90');
	export const symbolStructure = newCodicon('symbol-structure', '\\ea91');
	export const symbolStruct = newCodicon('symbol-struct', '\\ea91');
	export const symbolParameter = newCodicon('symbol-parameter', '\\ea92');
	export const symbolTypeParameter = newCodicon('symbol-type-parameter', '\\ea92');
	export const symbolKey = newCodicon('symbol-key', '\\ea93');
	export const symbolText = newCodicon('symbol-text', '\\ea93');
	export const symbolReference = newCodicon('symbol-reference', '\\ea94');
	export const goToFile = newCodicon('go-to-file', '\\ea94');
	export const symbolEnum = newCodicon('symbol-enum', '\\ea95');
	export const symbolValue = newCodicon('symbol-value', '\\ea95');
	export const symbolRuler = newCodicon('symbol-ruler', '\\ea96');
	export const symbolUnit = newCodicon('symbol-unit', '\\ea96');
	export const activateBreakpoints = newCodicon('activate-breakpoints', '\\ea97');
	export const archive = newCodicon('archive', '\\ea98');
	export const arrowBoth = newCodicon('arrow-both', '\\ea99');
	export const arrowDown = newCodicon('arrow-down', '\\ea9a');
	export const arrowLeft = newCodicon('arrow-left', '\\ea9b');
	export const arrowRight = newCodicon('arrow-right', '\\ea9c');
	export const arrowSmallDown = newCodicon('arrow-small-down', '\\ea9d');
	export const arrowSmallLeft = newCodicon('arrow-small-left', '\\ea9e');
	export const arrowSmallRight = newCodicon('arrow-small-right', '\\ea9f');
	export const arrowSmallUp = newCodicon('arrow-small-up', '\\eaa0');
	export const arrowUp = newCodicon('arrow-up', '\\eaa1');
	export const bell = newCodicon('bell', '\\eaa2');
	export const bold = newCodicon('bold', '\\eaa3');
	export const book = newCodicon('book', '\\eaa4');
	export const bookmark = newCodicon('bookmark', '\\eaa5');
	export const debugBreakpointConditionalUnverified = newCodicon('debug-breakpoint-conditional-unverified', '\\eaa6');
	export const debugBreakpointConditional = newCodicon('debug-breakpoint-conditional', '\\eaa7');
	export const debugBreakpointConditionalDisabled = newCodicon('debug-breakpoint-conditional-disabled', '\\eaa7');
	export const debugBreakpointDataUnverified = newCodicon('debug-breakpoint-data-unverified', '\\eaa8');
	export const debugBreakpointData = newCodicon('debug-breakpoint-data', '\\eaa9');
	export const debugBreakpointDataDisabled = newCodicon('debug-breakpoint-data-disabled', '\\eaa9');
	export const debugBreakpointLogUnverified = newCodicon('debug-breakpoint-log-unverified', '\\eaaa');
	export const debugBreakpointLog = newCodicon('debug-breakpoint-log', '\\eaab');
	export const debugBreakpointLogDisabled = newCodicon('debug-breakpoint-log-disabled', '\\eaab');
	export const briefcase = newCodicon('briefcase', '\\eaac');
	export const broadcast = newCodicon('broadcast', '\\eaad');
	export const browser = newCodicon('browser', '\\eaae');
	export const bug = newCodicon('bug', '\\eaaf');
	export const calendar = newCodicon('calendar', '\\eab0');
	export const caseSensitive = newCodicon('case-sensitive', '\\eab1');
	export const check = newCodicon('check', '\\eab2');
	export const checklist = newCodicon('checklist', '\\eab3');
	export const chevronDown = newCodicon('chevron-down', '\\eab4');
	export const dropDownButton = newCodicon('drop-down-button', Codicon.chevronDown.fontCharacter);
	export const chevronLeft = newCodicon('chevron-left', '\\eab5');
	export const chevronRight = newCodicon('chevron-right', '\\eab6');
	export const chevronUp = newCodicon('chevron-up', '\\eab7');
	export const chromeClose = newCodicon('chrome-close', '\\eab8');
	export const chromeMaximize = newCodicon('chrome-maximize', '\\eab9');
	export const chromeMinimize = newCodicon('chrome-minimize', '\\eaba');
	export const chromeRestore = newCodicon('chrome-restore', '\\eabb');
	export const circle = newCodicon('circle', '\\eabc');
	export const circleOutline = newCodicon('circle-outline', Codicon.circle.fontCharacter);
	export const debugBreakpointUnverified = newCodicon('debug-breakpoint-unverified', Codicon.circle.fontCharacter);
	export const circleSlash = newCodicon('circle-slash', '\\eabd');
	export const circuitBoard = newCodicon('circuit-board', '\\eabe');
	export const clearAll = newCodicon('clear-all', '\\eabf');
	export const clippy = newCodicon('clippy', '\\eac0');
	export const closeAll = newCodicon('close-all', '\\eac1');
	export const cloudDownload = newCodicon('cloud-download', '\\eac2');
	export const cloudUpload = newCodicon('cloud-upload', '\\eac3');
	export const code = newCodicon('code', '\\eac4');
	export const collapseAll = newCodicon('collapse-all', '\\eac5');
	export const colorMode = newCodicon('color-mode', '\\eac6');
	export const commentDiscussion = newCodicon('comment-discussion', '\\eac7');
	export const compareChanges = newCodicon('compare-changes', '\\eafd');
	export const creditCard = newCodicon('credit-card', '\\eac9');
	export const dash = newCodicon('dash', '\\eacc');
	export const dashboard = newCodicon('dashboard', '\\eacd');
	export const database = newCodicon('database', '\\eace');
	export const debugContinue = newCodicon('debug-continue', '\\eacf');
	export const debugDisconnect = newCodicon('debug-disconnect', '\\ead0');
	export const debugPause = newCodicon('debug-pause', '\\ead1');
	export const debugRestart = newCodicon('debug-restart', '\\ead2');
	export const debugStart = newCodicon('debug-start', '\\ead3');
	export const debugStepInto = newCodicon('debug-step-into', '\\ead4');
	export const debugStepOut = newCodicon('debug-step-out', '\\ead5');
	export const debugStepOver = newCodicon('debug-step-over', '\\ead6');
	export const debugStop = newCodicon('debug-stop', '\\ead7');
	export const debug = newCodicon('debug', '\\ead8');
	export const deviceCameraVideo = newCodicon('device-camera-video', '\\ead9');
	export const deviceCamera = newCodicon('device-camera', '\\eada');
	export const deviceMobile = newCodicon('device-mobile', '\\eadb');
	export const diffAdded = newCodicon('diff-added', '\\eadc');
	export const diffIgnored = newCodicon('diff-ignored', '\\eadd');
	export const diffModified = newCodicon('diff-modified', '\\eade');
	export const diffRemoved = newCodicon('diff-removed', '\\eadf');
	export const diffRenamed = newCodicon('diff-renamed', '\\eae0');
	export const diff = newCodicon('diff', '\\eae1');
	export const discard = newCodicon('discard', '\\eae2');
	export const editorLayout = newCodicon('editor-layout', '\\eae3');
	export const emptyWindow = newCodicon('empty-window', '\\eae4');
	export const exclude = newCodicon('exclude', '\\eae5');
	export const extensions = newCodicon('extensions', '\\eae6');
	export const eyeClosed = newCodicon('eye-closed', '\\eae7');
	export const fileBinary = newCodicon('file-binary', '\\eae8');
	export const fileCode = newCodicon('file-code', '\\eae9');
	export const fileMedia = newCodicon('file-media', '\\eaea');
	export const filePdf = newCodicon('file-pdf', '\\eaeb');
	export const fileSubmodule = newCodicon('file-submodule', '\\eaec');
	export const fileSymlinkDirectory = newCodicon('file-symlink-directory', '\\eaed');
	export const fileSymlinkFile = newCodicon('file-symlink-file', '\\eaee');
	export const fileZip = newCodicon('file-zip', '\\eaef');
	export const files = newCodicon('files', '\\eaf0');
	export const filter = newCodicon('filter', '\\eaf1');
	export const flame = newCodicon('flame', '\\eaf2');
	export const foldDown = newCodicon('fold-down', '\\eaf3');
	export const foldUp = newCodicon('fold-up', '\\eaf4');
	export const fold = newCodicon('fold', '\\eaf5');
	export const folderActive = newCodicon('folder-active', '\\eaf6');
	export const folderOpened = newCodicon('folder-opened', '\\eaf7');
	export const gear = newCodicon('gear', '\\eaf8');
	export const gift = newCodicon('gift', '\\eaf9');
	export const gistSecret = newCodicon('gist-secret', '\\eafa');
	export const gist = newCodicon('gist', '\\eafb');
	export const gitCommit = newCodicon('git-commit', '\\eafc');
	export const gitCompare = newCodicon('git-compare', '\\eafd');
	export const gitMerge = newCodicon('git-merge', '\\eafe');
	export const githubAction = newCodicon('github-action', '\\eaff');
	export const githubAlt = newCodicon('github-alt', '\\eb00');
	export const globe = newCodicon('globe', '\\eb01');
	export const grabber = newCodicon('grabber', '\\eb02');
	export const graph = newCodicon('graph', '\\eb03');
	export const gripper = newCodicon('gripper', '\\eb04');
	export const heart = newCodicon('heart', '\\eb05');
	export const home = newCodicon('home', '\\eb06');
	export const horizontalRule = newCodicon('horizontal-rule', '\\eb07');
	export const hubot = newCodicon('hubot', '\\eb08');
	export const inbox = newCodicon('inbox', '\\eb09');
	export const issueClosed = newCodicon('issue-closed', '\\eba4');
	export const issueReopened = newCodicon('issue-reopened', '\\eb0b');
	export const issues = newCodicon('issues', '\\eb0c');
	export const italic = newCodicon('italic', '\\eb0d');
	export const jersey = newCodicon('jersey', '\\eb0e');
	export const json = newCodicon('json', '\\eb0f');
	export const kebabVertical = newCodicon('kebab-vertical', '\\eb10');
	export const key = newCodicon('key', '\\eb11');
	export const law = newCodicon('law', '\\eb12');
	export const lightbulbAutofix = newCodicon('lightbulb-autofix', '\\eb13');
	export const linkExternal = newCodicon('link-external', '\\eb14');
	export const link = newCodicon('link', '\\eb15');
	export const listOrdered = newCodicon('list-ordered', '\\eb16');
	export const listUnordered = newCodicon('list-unordered', '\\eb17');
	export const liveShare = newCodicon('live-share', '\\eb18');
	export const loading = newCodicon('loading', '\\eb19');
	export const location = newCodicon('location', '\\eb1a');
	export const mailRead = newCodicon('mail-read', '\\eb1b');
	export const mail = newCodicon('mail', '\\eb1c');
	export const markdown = newCodicon('markdown', '\\eb1d');
	export const megaphone = newCodicon('megaphone', '\\eb1e');
	export const mention = newCodicon('mention', '\\eb1f');
	export const milestone = newCodicon('milestone', '\\eb20');
	export const mortarBoard = newCodicon('mortar-board', '\\eb21');
	export const move = newCodicon('move', '\\eb22');
	export const multipleWindows = newCodicon('multiple-windows', '\\eb23');
	export const mute = newCodicon('mute', '\\eb24');
	export const noNewline = newCodicon('no-newline', '\\eb25');
	export const note = newCodicon('note', '\\eb26');
	export const octoface = newCodicon('octoface', '\\eb27');
	export const openPreview = newCodicon('open-preview', '\\eb28');
	export const package_ = newCodicon('package', '\\eb29');
	export const paintcan = newCodicon('paintcan', '\\eb2a');
	export const pin = newCodicon('pin', '\\eb2b');
	export const play = newCodicon('play', '\\eb2c');
	export const run = newCodicon('run', '\\eb2c');
	export const plug = newCodicon('plug', '\\eb2d');
	export const preserveCase = newCodicon('preserve-case', '\\eb2e');
	export const preview = newCodicon('preview', '\\eb2f');
	export const project = newCodicon('project', '\\eb30');
	export const pulse = newCodicon('pulse', '\\eb31');
	export const question = newCodicon('question', '\\eb32');
	export const quote = newCodicon('quote', '\\eb33');
	export const radioTower = newCodicon('radio-tower', '\\eb34');
	export const reactions = newCodicon('reactions', '\\eb35');
	export const references = newCodicon('references', '\\eb36');
	export const refresh = newCodicon('refresh', '\\eb37');
	export const regex = newCodicon('regex', '\\eb38');
	export const remoteExplorer = newCodicon('remote-explorer', '\\eb39');
	export const remote = newCodicon('remote', '\\eb3a');
	export const remove = newCodicon('remove', '\\eb3b');
	export const replaceAll = newCodicon('replace-all', '\\eb3c');
	export const replace = newCodicon('replace', '\\eb3d');
	export const repoClone = newCodicon('repo-clone', '\\eb3e');
	export const repoForcePush = newCodicon('repo-force-push', '\\eb3f');
	export const repoPull = newCodicon('repo-pull', '\\eb40');
	export const repoPush = newCodicon('repo-push', '\\eb41');
	export const report = newCodicon('report', '\\eb42');
	export const requestChanges = newCodicon('request-changes', '\\eb43');
	export const rocket = newCodicon('rocket', '\\eb44');
	export const rootFolderOpened = newCodicon('root-folder-opened', '\\eb45');
	export const rootFolder = newCodicon('root-folder', '\\eb46');
	export const rss = newCodicon('rss', '\\eb47');
	export const ruby = newCodicon('ruby', '\\eb48');
	export const saveAll = newCodicon('save-all', '\\eb49');
	export const saveAs = newCodicon('save-as', '\\eb4a');
	export const save = newCodicon('save', '\\eb4b');
	export const screenFull = newCodicon('screen-full', '\\eb4c');
	export const screenNormal = newCodicon('screen-normal', '\\eb4d');
	export const searchStop = newCodicon('search-stop', '\\eb4e');
	export const server = newCodicon('server', '\\eb50');
	export const settingsGear = newCodicon('settings-gear', '\\eb51');
	export const settings = newCodicon('settings', '\\eb52');
	export const shield = newCodicon('shield', '\\eb53');
	export const smiley = newCodicon('smiley', '\\eb54');
	export const sortPrecedence = newCodicon('sort-precedence', '\\eb55');
	export const splitHorizontal = newCodicon('split-horizontal', '\\eb56');
	export const splitVertical = newCodicon('split-vertical', '\\eb57');
	export const squirrel = newCodicon('squirrel', '\\eb58');
	export const starFull = newCodicon('star-full', '\\eb59');
	export const starHalf = newCodicon('star-half', '\\eb5a');
	export const symbolClass = newCodicon('symbol-class', '\\eb5b');
	export const symbolColor = newCodicon('symbol-color', '\\eb5c');
	export const symbolCustomColor = newCodicon('symbol-customcolor', '\\eb5c');
	export const symbolConstant = newCodicon('symbol-constant', '\\eb5d');
	export const symbolEnumMember = newCodicon('symbol-enum-member', '\\eb5e');
	export const symbolField = newCodicon('symbol-field', '\\eb5f');
	export const symbolFile = newCodicon('symbol-file', '\\eb60');
	export const symbolInterface = newCodicon('symbol-interface', '\\eb61');
	export const symbolKeyword = newCodicon('symbol-keyword', '\\eb62');
	export const symbolMisc = newCodicon('symbol-misc', '\\eb63');
	export const symbolOperator = newCodicon('symbol-operator', '\\eb64');
	export const symbolProperty = newCodicon('symbol-property', '\\eb65');
	export const wrench = newCodicon('wrench', '\\eb65');
	export const wrenchSubaction = newCodicon('wrench-subaction', '\\eb65');
	export const symbolSnippet = newCodicon('symbol-snippet', '\\eb66');
	export const tasklist = newCodicon('tasklist', '\\eb67');
	export const telescope = newCodicon('telescope', '\\eb68');
	export const textSize = newCodicon('text-size', '\\eb69');
	export const threeBars = newCodicon('three-bars', '\\eb6a');
	export const thumbsdown = newCodicon('thumbsdown', '\\eb6b');
	export const thumbsup = newCodicon('thumbsup', '\\eb6c');
	export const tools = newCodicon('tools', '\\eb6d');
	export const triangleDown = newCodicon('triangle-down', '\\eb6e');
	export const triangleLeft = newCodicon('triangle-left', '\\eb6f');
	export const triangleRight = newCodicon('triangle-right', '\\eb70');
	export const triangleUp = newCodicon('triangle-up', '\\eb71');
	export const twitter = newCodicon('twitter', '\\eb72');
	export const unfold = newCodicon('unfold', '\\eb73');
	export const unlock = newCodicon('unlock', '\\eb74');
	export const unmute = newCodicon('unmute', '\\eb75');
	export const unverified = newCodicon('unverified', '\\eb76');
	export const verified = newCodicon('verified', '\\eb77');
	export const versions = newCodicon('versions', '\\eb78');
	export const vmActive = newCodicon('vm-active', '\\eb79');
	export const vmOutline = newCodicon('vm-outline', '\\eb7a');
	export const vmRunning = newCodicon('vm-running', '\\eb7b');
	export const watch = newCodicon('watch', '\\eb7c');
	export const whitespace = newCodicon('whitespace', '\\eb7d');
	export const wholeWord = newCodicon('whole-word', '\\eb7e');
	export const window = newCodicon('window', '\\eb7f');
	export const wordWrap = newCodicon('word-wrap', '\\eb80');
	export const zoomIn = newCodicon('zoom-in', '\\eb81');
	export const zoomOut = newCodicon('zoom-out', '\\eb82');
	export const listFilter = newCodicon('list-filter', '\\eb83');
	export const listFlat = newCodicon('list-flat', '\\eb84');
	export const listSelection = newCodicon('list-selection', '\\eb85');
	export const selection = newCodicon('selection', '\\eb85');
	export const listTree = newCodicon('list-tree', '\\eb86');
	export const debugBreakpointFunctionUnverified = newCodicon('debug-breakpoint-function-unverified', '\\eb87');
	export const debugBreakpointFunction = newCodicon('debug-breakpoint-function', '\\eb88');
	export const debugBreakpointFunctionDisabled = newCodicon('debug-breakpoint-function-disabled', '\\eb88');
	export const debugStackframeActive = newCodicon('debug-stackframe-active', '\\eb89');
	export const circleSmallFilled = newCodicon('circle-small-filled', '\\eb8a');
	export const debugStackframeDot = newCodicon('debug-stackframe-dot', Codicon.circleSmallFilled.fontCharacter);
	export const debugStackframe = newCodicon('debug-stackframe', '\\eb8b');
	export const debugStackframeFocused = newCodicon('debug-stackframe-focused', '\\eb8b');
	export const debugBreakpointUnsupported = newCodicon('debug-breakpoint-unsupported', '\\eb8c');
	export const symbolString = newCodicon('symbol-string', '\\eb8d');
	export const debugReverseContinue = newCodicon('debug-reverse-continue', '\\eb8e');
	export const debugStepBack = newCodicon('debug-step-back', '\\eb8f');
	export const debugRestartFrame = newCodicon('debug-restart-frame', '\\eb90');
	export const callIncoming = newCodicon('call-incoming', '\\eb92');
	export const callOutgoing = newCodicon('call-outgoing', '\\eb93');
	export const menu = newCodicon('menu', '\\eb94');
	export const expandAll = newCodicon('expand-all', '\\eb95');
	export const feedback = newCodicon('feedback', '\\eb96');
	export const groupByRefType = newCodicon('group-by-ref-type', '\\eb97');
	export const ungroupByRefType = newCodicon('ungroup-by-ref-type', '\\eb98');
	export const account = newCodicon('account', '\\eb99');
	export const bellDot = newCodicon('bell-dot', '\\eb9a');
	export const debugConsole = newCodicon('debug-console', '\\eb9b');
	export const library = newCodicon('library', '\\eb9c');
	export const output = newCodicon('output', '\\eb9d');
	export const runAll = newCodicon('run-all', '\\eb9e');
	export const syncIgnored = newCodicon('sync-ignored', '\\eb9f');
	export const pinned = newCodicon('pinned', '\\eba0');
	export const githubInverted = newCodicon('github-inverted', '\\eba1');
	export const debugAlt = newCodicon('debug-alt', '\\eb91');
	export const serverProcess = newCodicon('server-process', '\\eba2');
	export const serverEnvironment = newCodicon('server-environment', '\\eba3');
	export const pass = newCodicon('pass', '\\eba4');
	export const stopCircle = newCodicon('stop-circle', '\\eba5');
	export const playCircle = newCodicon('play-circle', '\\eba6');
	export const record = newCodicon('record', '\\eba7');
	export const debugAltSmall = newCodicon('debug-alt-small', '\\eba8');
	export const vmConnect = newCodicon('vm-connect', '\\eba9');
	export const cloud = newCodicon('cloud', '\\ebaa');
	export const merge = newCodicon('merge', '\\ebab');
	export const exportIcon = newCodicon('export', '\\ebac');
	export const graphLeft = newCodicon('graph-left', '\\ebad');
	export const magnet = newCodicon('magnet', '\\ebae');
	export const notebook = newCodicon('notebook', '\\ebaf');
	export const redo = newCodicon('redo', '\\ebb0');
	export const checkAll = newCodicon('check-all', '\\ebb1');
	export const pinnedDirty = newCodicon('pinned-dirty', '\\ebb2');
	export const passFilled = newCodicon('pass-filled', '\\ebb3');
	export const circleLargeFilled = newCodicon('circle-large-filled', '\\ebb4');
	export const circleLarge = newCodicon('circle-large', '\\ebb5');
	export const circleLargeOutline = newCodicon('circle-large-outline', Codicon.circleLarge.fontCharacter);
	export const combine = newCodicon('combine', '\\ebb6');
	export const gather = newCodicon('gather', '\\ebb6');
	export const table = newCodicon('table', '\\ebb7');
	export const variableGroup = newCodicon('variable-group', '\\ebb8');
	export const typeHierarchy = newCodicon('type-hierarchy', '\\ebb9');
	export const typeHierarchySub = newCodicon('type-hierarchy-sub', '\\ebba');
	export const typeHierarchySuper = newCodicon('type-hierarchy-super', '\\ebbb');
	export const gitPullRequestCreate = newCodicon('git-pull-request-create', '\\ebbc');
	export const runAbove = newCodicon('run-above', '\\ebbd');
	export const runBelow = newCodicon('run-below', '\\ebbe');
	export const notebookTemplate = newCodicon('notebook-template', '\\ebbf');
	export const debugRerun = newCodicon('debug-rerun', '\\ebc0');
	export const workspaceTrusted = newCodicon('workspace-trusted', '\\ebc1');
	export const workspaceUntrusted = newCodicon('workspace-untrusted', '\\ebc2');
	export const workspaceUnspecified = newCodicon('workspace-unspecified', '\\ebc3');
	export const terminalCmd = newCodicon('terminal-cmd', '\\ebc4');
	export const terminalDebian = newCodicon('terminal-debian', '\\ebc5');
	export const terminalLinux = newCodicon('terminal-linux', '\\ebc6');
	export const terminalPowershell = newCodicon('terminal-powershell', '\\ebc7');
	export const terminalTmux = newCodicon('terminal-tmux', '\\ebc8');
	export const terminalUbuntu = newCodicon('terminal-ubuntu', '\\ebc9');
	export const terminalBash = newCodicon('terminal-bash', '\\ebca');
	export const arrowSwap = newCodicon('arrow-swap', '\\ebcb');
	export const copy = newCodicon('copy', '\\ebcc');
	export const personAdd = newCodicon('person-add', '\\ebcd');
	export const filterFilled = newCodicon('filter-filled', '\\ebce');
	export const wand = newCodicon('wand', '\\ebcf');
	export const debugLineByLine = newCodicon('debug-line-by-line', '\\ebd0');
	export const inspect = newCodicon('inspect', '\\ebd1');
	export const layers = newCodicon('layers', '\\ebd2');
	export const layersDot = newCodicon('layers-dot', '\\ebd3');
	export const layersActive = newCodicon('layers-active', '\\ebd4');
	export const compass = newCodicon('compass', '\\ebd5');
	export const compassDot = newCodicon('compass-dot', '\\ebd6');
	export const compassActive = newCodicon('compass-active', '\\ebd7');
	export const azure = newCodicon('azure', '\\ebd8');
	export const issueDraft = newCodicon('issue-draft', '\\ebd9');
	export const gitPullRequestClosed = newCodicon('git-pull-request-closed', '\\ebda');
	export const gitPullRequestDraft = newCodicon('git-pull-request-draft', '\\ebdb');
	export const debugAll = newCodicon('debug-all', '\\ebdc');
	export const debugCoverage = newCodicon('debug-coverage', '\\ebdd');
	export const runErrors = newCodicon('run-errors', '\\ebde');
	export const folderLibrary = newCodicon('folder-library', '\\ebdf');
	export const debugContinueSmall = newCodicon('debug-continue-small', '\\ebe0');
	export const beakerStop = newCodicon('beaker-stop', '\\ebe1');
	export const graphLine = newCodicon('graph-line', '\\ebe2');
	export const graphScatter = newCodicon('graph-scatter', '\\ebe3');
	export const pieChart = newCodicon('pie-chart', '\\ebe4');
	export const bracket = newCodicon('bracket', Codicon.json.fontCharacter);
	export const bracketDot = newCodicon('bracket-dot', '\\ebe5');
	export const bracketError = newCodicon('bracket-error', '\\ebe6');
	export const lockSmall = newCodicon('lock-small', '\\ebe7');
	export const azureDevops = newCodicon('azure-devops', '\\ebe8');
	export const verifiedFilled = newCodicon('verified-filled', '\\ebe9');
	export const newLine = newCodicon('newline', '\\ebea');
	export const layout = newCodicon('layout', '\\ebeb');
	export const layoutActivitybarLeft = newCodicon('layout-activitybar-left', '\\ebec');
	export const layoutActivitybarRight = newCodicon('layout-activitybar-right', '\\ebed');
	export const layoutPanelLeft = newCodicon('layout-panel-left', '\\ebee');
	export const layoutPanelCenter = newCodicon('layout-panel-center', '\\ebef');
	export const layoutPanelJustify = newCodicon('layout-panel-justify', '\\ebf0');
	export const layoutPanelRight = newCodicon('layout-panel-right', '\\ebf1');
	export const layoutPanel = newCodicon('layout-panel', '\\ebf2');
	export const layoutSidebarLeft = newCodicon('layout-sidebar-left', '\\ebf3');
	export const layoutSidebarRight = newCodicon('layout-sidebar-right', '\\ebf4');
	export const layoutStatusbar = newCodicon('layout-statusbar', '\\ebf5');
	export const layoutMenubar = newCodicon('layout-menubar', '\\ebf6');
	export const layoutCentered = newCodicon('layout-centered', '\\ebf7');
	export const layoutSidebarRightOff = newCodicon('layout-sidebar-right-off', '\\ec00');
	export const layoutPanelOff = newCodicon('layout-panel-off', '\\ec01');
	export const layoutSidebarLeftOff = newCodicon('layout-sidebar-left-off', '\\ec02');
	export const target = newCodicon('target', '\\ebf8');
	export const indent = newCodicon('indent', '\\ebf9');
	export const recordSmall = newCodicon('record-small', '\\ebfa');
	export const errorSmall = newCodicon('error-small', '\\ebfb');
	export const arrowCircleDown = newCodicon('arrow-circle-down', '\\ebfc');
	export const arrowCircleLeft = newCodicon('arrow-circle-left', '\\ebfd');
	export const arrowCircleRight = newCodicon('arrow-circle-right', '\\ebfe');
	export const arrowCircleUp = newCodicon('arrow-circle-up', '\\ebff');
	export const heartFilled = newCodicon('heart-filled', '\\ec04');
	export const map = newCodicon('map', '\\ec05');
	export const mapFilled = newCodicon('map-filled', '\\ec06');
	export const circleSmall = newCodicon('circle-small', '\\ec07');
	export const bellSlash = newCodicon('bell-slash', '\\ec08');
	export const bellSlashDot = newCodicon('bell-slash-dot', '\\ec09');
	export const commentUnresolved = newCodicon('comment-unresolved', '\\ec0a');
	export const gitPullRequestGoToChanges = newCodicon('git-pull-request-go-to-changes', '\\ec0b');
	export const gitPullRequestNewChanges = newCodicon('git-pull-request-new-changes', '\\ec0c');
	export const searchFuzzy = newCodicon('search-fuzzy', '\\ec0d');
	export const commentDraft = newCodicon('comment-draft', '\\ec0e');


	// derived icons, that could become separate icons

	export const dialogError = newCodicon('dialog-error', Codicon.error.fontCharacter);
	export const dialogWarning = newCodicon('dialog-warning', Codicon.warning.fontCharacter);
	export const dialogInfo = newCodicon('dialog-info', Codicon.info.fontCharacter);
	export const dialogClose = newCodicon('dialog-close', Codicon.close.fontCharacter);

	export const treeItemExpanded = newCodicon('tree-item-expanded', Codicon.chevronDown.fontCharacter); // collapsed is done with rotation

	export const treeFilterOnTypeOn = newCodicon('tree-filter-on-type-on', Codicon.listFilter.fontCharacter);
	export const treeFilterOnTypeOff = newCodicon('tree-filter-on-type-off', Codicon.listSelection.fontCharacter);
	export const treeFilterClear = newCodicon('tree-filter-clear', Codicon.close.fontCharacter);

	export const treeItemLoading = newCodicon('tree-item-loading', Codicon.loading.fontCharacter);

	export const menuSelection = newCodicon('menu-selection', Codicon.check.fontCharacter);
	export const menuSubmenu = newCodicon('menu-submenu', Codicon.chevronRight.fontCharacter);

	export const menuBarMore = newCodicon('menubar-more', Codicon.more.fontCharacter);

	export const scrollbarButtonLeft = newCodicon('scrollbar-button-left', Codicon.triangleLeft.fontCharacter);
	export const scrollbarButtonRight = newCodicon('scrollbar-button-right', Codicon.triangleRight.fontCharacter);

	export const scrollbarButtonUp = newCodicon('scrollbar-button-up', Codicon.triangleUp.fontCharacter);
	export const scrollbarButtonDown = newCodicon('scrollbar-button-down', Codicon.triangleDown.fontCharacter);

	export const toolBarMore = newCodicon('toolbar-more', Codicon.more.fontCharacter);

	export const quickInputBack = newCodicon('quick-input-back', Codicon.arrowLeft.fontCharacter);
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
