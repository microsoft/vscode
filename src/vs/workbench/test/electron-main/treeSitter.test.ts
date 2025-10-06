/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-import-patterns
import type * as Parser from '@vscode/tree-sitter-wasm';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getModuleLocation } from '../../../editor/common/services/treeSitter/treeSitterLanguages.js';
import { AppResourcePath, FileAccess, Schemas } from '../../../base/common/network.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import assert from 'assert';
import { importAMDNodeModule } from '../../../amdX.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../platform/files/node/diskFileSystemProvider.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { StringEdit, StringReplacement } from '../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../editor/common/core/ranges/offsetRange.js';
import { PositionOffsetTransformer } from '../../../editor/common/core/text/positionToOffset.js';
import { StringText } from '../../../editor/common/core/text/abstractText.js';
import { TextEdit } from '../../../editor/common/core/edits/textEdit.js';

suite('Tree Sitter API test', function () {

	let disposables: DisposableStore;
	let parser: Parser.Parser;

	setup(async () => {
		disposables = new DisposableStore();
		const instantiationService = disposables.add(new TestInstantiationService());
		const fileService = disposables.add(instantiationService.createInstance(FileService));
		const logService = new NullLogService();

		const diskFileSystemProvider = disposables.add(new DiskFileSystemProvider(logService));
		disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));

		const Parser = await importAMDNodeModule<typeof import('@vscode/tree-sitter-wasm')>('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
		await Parser.Parser.init({
			locateFile(_file: string, _folder: string) {
				const location: AppResourcePath = `${getModuleLocation({} as IEnvironmentService)}/tree-sitter.wasm`;
				return FileAccess.asFileUri(location).toString(true);
			}
		});
		const languagePath = `${getModuleLocation({} as IEnvironmentService)}/tree-sitter-typescript.wasm`;


		const languageFile = await (fileService.readFile(FileAccess.asFileUri(languagePath as AppResourcePath)));
		const language = await Parser.Language.load(languageFile.value.buffer);
		parser = new Parser.Parser();
		parser.setLanguage(language);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Test progress callback immediate interrupt', async () => {
		const tree = parser.parse(largeTestData, null, {
			progressCallback: () => {
				return true;
			}
		});
		assert.strictEqual(tree, null);
	});

	test('Test original tree is not modified during parse', async () => {
		const originalTree = parser.parse(largeTestData);
		assert.notStrictEqual(originalTree, null);
		originalTree!.edit({
			startIndex: 401,
			startPosition: {
				row: 8,
				column: 4
			},
			oldEndIndex: 541,
			oldEndPosition: {
				row: 10,
				column: 57,
			},
			newEndIndex: 401,
			newEndPosition: {
				row: 8,
				column: 4
			}
		});
		const preParseOriginalTreeDump = printTree(originalTree!);
		const editedTestData = largeTestData.substring(0, 401) + largeTestData.substring(541);
		const modifiedTree = parser.parse(editedTestData, originalTree);
		assert.notStrictEqual(modifiedTree, null);
		const postParseOriginalTreeDump = printTree(originalTree!);
		assert.strictEqual(preParseOriginalTreeDump, postParseOriginalTreeDump);
		originalTree?.delete();
		modifiedTree?.delete();
	});

	test('Test getChangedRanges - ranges are as expected', async () => {
		const originalTree = parser.parse(smallTestData);
		assert.notStrictEqual(originalTree, null);
		const offsetRange = new OffsetRange(152, 179);
		const replacement = new StringReplacement(offsetRange, '');

		const editedTestData = applyEditToTree(originalTree!, smallTestData, offsetRange, replacement);

		const modifiedTree = parser.parse(editedTestData, originalTree);
		assert.notStrictEqual(modifiedTree, null);
		const diff = modifiedTree!.getChangedRanges(originalTree!);
		assert.strictEqual(diff.length, 0);
		originalTree?.delete();
		modifiedTree?.delete();
	});

	test('Test getChangedRanges 2 - ranges are as expected', async () => {
		const originalTree = parser.parse(smallTestData);
		assert.notStrictEqual(originalTree, null);

		// Add some backticks
		const offsetRanges = [new OffsetRange(153, 153), new OffsetRange(271, 271)];
		const replacements = [new StringReplacement(offsetRanges[0], 'private x =`'), new StringReplacement(offsetRanges[1], '`')];
		let editedTestData = smallTestData;
		for (let i = 0; i < offsetRanges.length; i++) {
			const offsetRange = offsetRanges[i];
			const replacement = replacements[i];
			editedTestData = applyEditToTree(originalTree!, editedTestData, offsetRange, replacement);
		}

		const modifiedTreeOne = parser.parse(editedTestData, originalTree);
		assert.notStrictEqual(modifiedTreeOne, null);
		const diff = originalTree!.getChangedRanges(modifiedTreeOne!);
		assert.strictEqual(diff.length, 1);
		assert.strictEqual(JSON.stringify(diff[0]), '{"startPosition":{"row":7,"column":2},"endPosition":{"row":14,"column":3},"startIndex":153,"endIndex":272}');

		// Remove the last backtick
		const offsetRange2 = new OffsetRange(271, 272);
		const replacement2 = new StringReplacement(offsetRange2, '');
		const editedTestDataTwo = applyEditToTree(modifiedTreeOne!, editedTestData, offsetRange2, replacement2);

		const modifiedTreeTwo = parser.parse(editedTestDataTwo, modifiedTreeOne);
		const diffTwo = modifiedTreeOne!.getChangedRanges(modifiedTreeTwo!);
		assert.strictEqual(diffTwo.length, 1);
		assert.strictEqual(JSON.stringify(diffTwo[0]), '{"startPosition":{"row":7,"column":13},"endPosition":{"row":14,"column":2},"startIndex":164,"endIndex":271}');
		originalTree?.delete();
		modifiedTreeOne?.delete();
		modifiedTreeTwo?.delete();
	});

	test('Test getChangedRanges 3 - ranges are not as expected because the syntax doesn\'t change', async () => {
		const initialTestData = 'const x = 1;\nconst y = 2;';

		const originalTree = parser.parse(initialTestData);
		assert.notStrictEqual(originalTree, null);

		const offsetRange = new OffsetRange(10, 11);
		const replacement = new StringReplacement(offsetRange, '30');
		const editedTestData = applyEditToTree(originalTree!, initialTestData, offsetRange, replacement);


		const modifiedTree = parser.parse(editedTestData, originalTree);
		assert.notStrictEqual(modifiedTree, null);
		const diff = originalTree!.getChangedRanges(modifiedTree!);
		assert.strictEqual(diff.length, 0);
	});

	function applyEditToTree(tree: Parser.Tree, baseText: string, offsetRange: OffsetRange, stringReplacement: StringReplacement): string {
		const stringEdit = new StringEdit([stringReplacement]);
		const edit = new PositionOffsetTransformer(baseText).getTextEdit(stringEdit);

		const replacement = edit.replacements[0];
		const textWithEdits = new TextEdit([replacement]).apply(new StringText(baseText));
		const newRange = edit.getNewRanges()[0];
		const transformer = new PositionOffsetTransformer(textWithEdits);
		const endOffset = transformer.getOffset(newRange.getEndPosition());

		tree!.edit({
			startIndex: offsetRange.start,
			startPosition: {
				row: replacement.range.startLineNumber - 1,
				column: replacement.range.startColumn - 1
			},
			oldEndIndex: offsetRange.endExclusive,
			oldEndPosition: {
				row: replacement.range.endLineNumber - 1,
				column: replacement.range.endColumn - 1,
			},
			newEndIndex: endOffset,
			newEndPosition: {
				row: newRange.endLineNumber - 1,
				column: newRange.endColumn - 1
			}
		});
		return textWithEdits;
	}

	function printTree(tree: Parser.Tree, simple: boolean = false): string {
		return JSON.stringify(expandNode(tree.rootNode, simple));
	}

	function expandNode(node: Parser.Node, simple: boolean): any {
		if (simple) {
			return {
				text: node.text,
				children: node.children.map((child) => child ? expandNode(child, simple) : null)
			};
		}
		return {
			type: node.type,
			startPosition: node.startPosition,
			endPosition: node.endPosition,
			startIndex: node.startIndex,
			endIndex: node.endIndex,
			isNamed: node.isNamed,
			hasError: node.hasError,
			childCount: node.childCount,
			children: node.children.map((child) => child ? expandNode(child, simple) : null),
			id: node.id,
			descendantCount: node.descendantCount,
			hasChanges: node.hasChanges,
			text: node.text
		};
	}

	const smallTestData = "export class TreeView extends AbstractTreeView {\n\n\tprotected activate() {\n\t\tif (!this.activated) {\n\t\t\tthis.createTree();\n\t\t\tthis.activated = true;\n\t\t}\n\t}\n\n\tprotected activate2() {\n\t\tif (!this.activated) {\n\t\t\tthis.createTree();\n\t\t\tthis.activated = true;\n\t\t}\n\t}\n}";

	const largeTestData = `
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TreeViewPane extends ViewPane {

	protected readonly treeView: ITreeView;
	private _container: HTMLElement | undefined;
	private _actionRunner: MultipleSelectionActionRunner;

	constructor(

	) {
		super({ ...(options as IViewPaneOptions), titleMenuId: MenuId.ViewTitle, donotForwardArgs: false }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
		const { treeView } = (<ITreeViewDescriptor>Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).getView(options.id));
		this.treeView = treeView;
		this._register(this.treeView.onDidChangeActions(() => this.updateActions(), this));
		this._register(this.treeView.onDidChangeTitle((newTitle) => this.updateTitle(newTitle)));
		this._register(this.treeView.onDidChangeDescription((newDescription) => this.updateTitleDescription(newDescription)));
		this._register(toDisposable(() => {
			if (this._container && this.treeView.container && (this._container === this.treeView.container)) {
				this.treeView.setVisibility(false);
			}
		}));
		this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
		this._register(this.treeView.onDidChangeWelcomeState(() => this._onDidChangeViewWelcomeState.fire()));
		if (options.title !== this.treeView.title) {
			this.updateTitle(this.treeView.title);
		}
		if (options.titleDescription !== this.treeView.description) {
			this.updateTitleDescription(this.treeView.description);
		}
		this._actionRunner = this._register(new MultipleSelectionActionRunner(notificationService, () => this.treeView.getSelection()));

		this.updateTreeVisibility();
	}

	override focus(): void {
		super.focus();
		this.treeView.focus();
	}

	protected override renderBody(container: HTMLElement): void {
		this._container = container;
		super.renderBody(container);
		this.renderTreeView(container);
	}

	override shouldShowWelcome(): boolean {
		return ((this.treeView.dataProvider === undefined) || !!this.treeView.dataProvider.isTreeEmpty) && ((this.treeView.message === undefined) || (this.treeView.message === ''));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.layoutTreeView(height, width);
	}

	override getOptimalWidth(): number {
		return this.treeView.getOptimalWidth();
	}

	protected renderTreeView(container: HTMLElement): void {
		this.treeView.show(container);
	}

	protected layoutTreeView(height: number, width: number): void {
		this.treeView.layout(height, width);
	}

	private updateTreeVisibility(): void {
		this.treeView.setVisibility(this.isBodyVisible());
	}

	override getActionRunner() {
		return this._actionRunner;
	}

	override getActionsContext(): TreeViewPaneHandleArg {
		return { $treeViewId: this.id, $focusedTreeItem: true, $selectedTreeItems: true };
	}

}

class Root implements ITreeItem {
	label = { label: 'root' };
	handle = '0';
	parentHandle: string | undefined = undefined;
	collapsibleState = TreeItemCollapsibleState.Expanded;
	children: ITreeItem[] | undefined = undefined;
}

function commandPreconditions(commandId: string): ContextKeyExpression | undefined {
	const command = CommandsRegistry.getCommand(commandId);
	if (command) {
		const commandAction = MenuRegistry.getCommand(command.id);
		return commandAction && commandAction.precondition;
	}
	return undefined;
}

function isTreeCommandEnabled(treeCommand: TreeCommand | Command, contextKeyService: IContextKeyService): boolean {
	const commandId: string = (treeCommand as TreeCommand).originalId ? (treeCommand as TreeCommand).originalId! : treeCommand.id;
	const precondition = commandPreconditions(commandId);
	if (precondition) {
		return contextKeyService.contextMatchesRules(precondition);
	}

	return true;
}

interface RenderedMessage { element: HTMLElement; disposables: DisposableStore }

function isRenderedMessageValue(messageValue: string | RenderedMessage | undefined): messageValue is RenderedMessage {
	return !!messageValue && typeof messageValue !== 'string' && !!messageValue.element && !!messageValue.disposables;
}

const noDataProviderMessage = localize('no-dataprovider', "There is no data provider registered that can provide view data.");

export const RawCustomTreeViewContextKey = new RawContextKey<boolean>('customTreeView', false);

class Tree extends WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore> { }

abstract class AbstractTreeView extends Disposable implements ITreeView {

	private readonly _onDidCompleteRefresh: Emitter<void> = this._register(new Emitter<void>());

	constructor(
		readonly id: string,
		private _title: string,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProgressService protected readonly progressService: IProgressService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@ILogService private readonly logService: ILogService,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super();
		this.root = new Root();
		this.lastActive = this.root;
		// Try not to add anything that could be costly to this constructor. It gets called once per tree view
		// during startup, and anything added here can affect performance.
	}

	private _isInitialized: boolean = false;
	private initialize() {
		if (this._isInitialized) {
			return;
		}
		this._isInitialized = true;

		// Remember when adding to this method that it isn't called until the view is visible, meaning that
		// properties could be set and events could be fired before we're initialized and that this needs to be handled.

		this.contextKeyService.bufferChangeEvents(() => {
			this.initializeShowCollapseAllAction();
			this.initializeCollapseAllToggle();
			this.initializeShowRefreshAction();
		});

		this.treeViewDnd = this.instantiationService.createInstance(CustomTreeViewDragAndDrop, this.id);
		if (this._dragAndDropController) {
			this.treeViewDnd.controller = this._dragAndDropController;
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer.decorations')) {
				this.doRefresh([this.root]); /** soft refresh **/
			}
		}));
		this._register(this.viewDescriptorService.onDidChangeLocation(({ views, from, to }) => {
			if (views.some(v => v.id === this.id)) {
				this.tree?.updateOptions({ overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles });
			}
		}));
		this.registerActions();

		this.create();
	}

	private _message: string | IMarkdownString | undefined;
	get message(): string | IMarkdownString | undefined {
		return this._message;
	}

	set message(message: string | IMarkdownString | undefined) {
		this._message = message;
		this.updateMessage();
		this._onDidChangeWelcomeState.fire();
	}

	setVisibility(isVisible: boolean): void {
		// Throughout setVisibility we need to check if the tree view's data provider still exists.
		// This can happen because the 'getChildren' call to the extension can return
		// after the tree has been disposed.

		this.initialize();
		isVisible = !!isVisible;
		if (this.isVisible === isVisible) {
			return;
		}

		this.isVisible = isVisible;

		if (this.tree) {
			if (this.isVisible) {
				DOM.show(this.tree.getHTMLElement());
			} else {
				DOM.hide(this.tree.getHTMLElement()); // make sure the tree goes out of the tabindex world by hiding it
			}

			if (this.isVisible && this.elementsToRefresh.length && this.dataProvider) {
				this.doRefresh(this.elementsToRefresh);
				this.elementsToRefresh = [];
			}
		}

		setTimeout0(() => {
			if (this.dataProvider) {
				this._onDidChangeVisibility.fire(this.isVisible);
			}
		});

		if (this.visible) {
			this.activate();
		}
	}

	protected activated: boolean = false;
	protected abstract activate(): void;

	focus(reveal: boolean = true, revealItem?: ITreeItem): void {
		if (this.tree && this.root.children && this.root.children.length > 0) {
			// Make sure the current selected element is revealed
			const element = revealItem ?? this.tree.getSelection()[0];
			if (element && reveal) {
				this.tree.reveal(element, 0.5);
			}

			// Pass Focus to Viewer
			this.tree.domFocus();
		} else if (this.tree && this.treeContainer && !this.treeContainer.classList.contains('hide')) {
			this.tree.domFocus();
		} else {
			this.domNode.focus();
		}
	}
}
class MultipleSelectionActionRunner extends ActionRunner {

	constructor(notificationService: INotificationService, private getSelectedResources: (() => ITreeItem[])) {
		super();
		this._register(this.onDidRun(e => {
			if (e.error && !isCancellationError(e.error)) {
				notificationService.error(localize('command-error', 'Error running command {1}: {0}. This is likely caused by the extension that contributes {1}.', e.error.message, e.action.id));
			}
		}));
	}

	protected override async runAction(action: IAction, context: TreeViewItemHandleArg | TreeViewPaneHandleArg): Promise<void> {
		const selection = this.getSelectedResources();
		let selectionHandleArgs: TreeViewItemHandleArg[] | undefined = undefined;
		let actionInSelected: boolean = false;
		if (selection.length > 1) {
			selectionHandleArgs = selection.map(selected => {
				if ((selected.handle === (context as TreeViewItemHandleArg).$treeItemHandle) || (context as TreeViewPaneHandleArg).$selectedTreeItems) {
					actionInSelected = true;
				}
				return { $treeViewId: context.$treeViewId, $treeItemHandle: selected.handle };
			});
		}

		if (!actionInSelected && selectionHandleArgs) {
			selectionHandleArgs = undefined;
		}

		await action.run(context, selectionHandleArgs);
	}
}
`;
});
