/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IIdentityProvider } from '../../../../../base/browser/ui/list/list.js';
import { ICompressedTreeElement, ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeContextMenuEvent, ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { FuzzyScore } from '../../../../../base/common/filters.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { autorun } from '../../../../../base/common/observable.js';
import { count } from '../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { MenuEntryActionViewItem, fillInActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchCompressibleObjectTree } from '../../../../../platform/list/browser/listService.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { widgetClose } from '../../../../../platform/theme/common/iconRegistry.js';
import { getTestItemContextOverlay } from '../explorerProjections/testItemContextOverlay.js';
import * as icons from '../icons.js';
import { renderTestMessageAsText } from '../testMessageColorizer.js';
import { InspectSubject, MessageSubject, TaskSubject, TestOutputSubject, getMessageArgs, mapFindTestMessage } from './testResultsSubject.js';
import { TestCommandId, Testing } from '../../common/constants.js';
import { ITestCoverageService } from '../../common/testCoverageService.js';
import { ITestExplorerFilterState } from '../../common/testExplorerFilterState.js';
import { ITestProfileService } from '../../common/testProfileService.js';
import { ITestResult, ITestRunTaskResults, LiveTestResult, TestResultItemChangeReason, maxCountPriority } from '../../common/testResult.js';
import { ITestResultService } from '../../common/testResultService.js';
import { IRichLocation, ITestItemContext, ITestMessage, ITestMessageMenuArgs, InternalTestItem, TestMessageType, TestResultItem, TestResultState, TestRunProfileBitset, testResultStateToContextValues } from '../../common/testTypes.js';
import { TestingContextKeys } from '../../common/testingContextKeys.js';
import { cmpPriority, isFailedState } from '../../common/testingStates.js';
import { TestUriType, buildTestUri } from '../../common/testingUri.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { TestId } from '../../common/testId.js';


interface ITreeElement {
	type: string;
	context: unknown;
	id: string;
	label: string;
	onDidChange: Event<void>;
	labelWithIcons?: readonly (HTMLSpanElement | string)[];
	icon?: ThemeIcon;
	description?: string;
	ariaLabel?: string;
}

interface ITreeElement {
	type: string;
	context: unknown;
	id: string;
	label: string;
	onDidChange: Event<void>;
	labelWithIcons?: readonly (HTMLSpanElement | string)[];
	icon?: ThemeIcon;
	description?: string;
	ariaLabel?: string;
}

class TestResultElement implements ITreeElement {
	public readonly changeEmitter = new Emitter<void>();
	public readonly onDidChange = this.changeEmitter.event;
	public readonly type = 'result';
	public readonly context: string;
	public readonly id: string;
	public readonly label: string;

	public get icon() {
		return icons.testingStatesToIcons.get(
			this.value.completedAt === undefined
				? TestResultState.Running
				: maxCountPriority(this.value.counts)
		);
	}

	constructor(public readonly value: ITestResult) {
		this.id = value.id;
		this.context = value.id;
		this.label = value.name;
	}
}

const openCoverageLabel = localize('openTestCoverage', 'View Test Coverage');
const closeCoverageLabel = localize('closeTestCoverage', 'Close Test Coverage');

class CoverageElement implements ITreeElement {
	public readonly type = 'coverage';
	public readonly context: undefined;
	public readonly id: string;
	public readonly onDidChange: Event<void>;

	public get label() {
		return this.isOpen ? closeCoverageLabel : openCoverageLabel;
	}

	public get icon() {
		return this.isOpen ? widgetClose : icons.testingCoverageReport;
	}

	public get isOpen() {
		return this.coverageService.selected.get()?.fromTaskId === this.task.id;
	}

	constructor(
		results: ITestResult,
		public readonly task: ITestRunTaskResults,
		private readonly coverageService: ITestCoverageService,
	) {
		this.id = `coverage-${results.id}/${task.id}`;
		this.onDidChange = Event.fromObservableLight(coverageService.selected);
	}
}

class OlderResultsElement implements ITreeElement {
	public readonly type = 'older';
	public readonly context: undefined;
	public readonly id: string;
	public readonly onDidChange = Event.None;
	public readonly label: string;

	constructor(private readonly n: number) {
		this.label = n === 1
			? localize('oneOlderResult', '1 older result')
			: localize('nOlderResults', '{0} older results', n);
		this.id = `older-${this.n}`;

	}
}

class TestCaseElement implements ITreeElement {
	public readonly type = 'test';
	public readonly context: ITestItemContext;
	public readonly id: string;
	public readonly description?: string;

	public get onDidChange() {
		if (!(this.results instanceof LiveTestResult)) {
			return Event.None;
		}

		return Event.filter(this.results.onChange, e => e.item.item.extId === this.test.item.extId);
	}

	public get state() {
		return this.test.tasks[this.taskIndex].state;
	}

	public get label() {
		return this.test.item.label;
	}

	public get labelWithIcons() {
		return renderLabelWithIcons(this.label);
	}

	public get icon() {
		return icons.testingStatesToIcons.get(this.state);
	}

	public get outputSubject() {
		return new TestOutputSubject(this.results, this.taskIndex, this.test);
	}


	constructor(
		public readonly results: ITestResult,
		public readonly test: TestResultItem,
		public readonly taskIndex: number,
	) {
		this.id = `${results.id}/${test.item.extId}`;

		const parentId = TestId.fromString(test.item.extId).parentId;
		if (parentId) {
			this.description = '';
			for (const part of parentId.idsToRoot()) {
				if (part.isRoot) { break; }
				const test = results.getStateById(part.toString());
				if (!test) { break; }
				if (this.description.length) {
					this.description += ' \u2039 ';
				}

				this.description += test.item.label;
			}
		}

		this.context = {
			$mid: MarshalledId.TestItemContext,
			tests: [InternalTestItem.serialize(test)],
		};
	}
}

class TaskElement implements ITreeElement {
	public readonly changeEmitter = new Emitter<void>();
	public readonly onDidChange = this.changeEmitter.event;
	public readonly type = 'task';
	public readonly context: { resultId: string; taskId: string };
	public readonly id: string;
	public readonly label: string;
	public readonly itemsCache = new CreationCache<TestCaseElement>();

	public get icon() {
		return this.results.tasks[this.index].running ? icons.testingStatesToIcons.get(TestResultState.Running) : undefined;
	}

	constructor(public readonly results: ITestResult, public readonly task: ITestRunTaskResults, public readonly index: number) {
		this.id = `${results.id}/${index}`;
		this.task = results.tasks[index];
		this.context = { resultId: results.id, taskId: this.task.id };
		this.label = this.task.name;
	}
}

class TestMessageElement implements ITreeElement {
	public readonly type = 'message';
	public readonly id: string;
	public readonly label: string;
	public readonly uri: URI;
	public readonly location?: IRichLocation;
	public readonly description?: string;
	public readonly contextValue?: string;
	public readonly message: ITestMessage;

	public get onDidChange() {
		if (!(this.result instanceof LiveTestResult)) {
			return Event.None;
		}

		// rerender when the test case changes so it gets retired events
		return Event.filter(this.result.onChange, e => e.item.item.extId === this.test.item.extId);
	}

	public get context(): ITestMessageMenuArgs {
		return getMessageArgs(this.test, this.message);
	}

	public get outputSubject() {
		return new TestOutputSubject(this.result, this.taskIndex, this.test);
	}

	constructor(
		public readonly result: ITestResult,
		public readonly test: TestResultItem,
		public readonly taskIndex: number,
		public readonly messageIndex: number,
	) {
		const m = this.message = test.tasks[taskIndex].messages[messageIndex];

		this.location = m.location;
		this.contextValue = m.type === TestMessageType.Error ? m.contextValue : undefined;
		this.uri = buildTestUri({
			type: TestUriType.ResultMessage,
			messageIndex,
			resultId: result.id,
			taskIndex,
			testExtId: test.item.extId
		});

		this.id = this.uri.toString();

		const asPlaintext = renderTestMessageAsText(m.message);
		const lines = count(asPlaintext.trimEnd(), '\n');
		this.label = firstLine(asPlaintext);
		if (lines > 0) {
			this.description = lines > 1
				? localize('messageMoreLinesN', '+ {0} more lines', lines)
				: localize('messageMoreLines1', '+ 1 more line');
		}
	}
}

type TreeElement = TestResultElement | TestCaseElement | TestMessageElement | TaskElement | CoverageElement | OlderResultsElement;

export class OutputPeekTree extends Disposable {
	private disposed = false;
	private readonly tree: WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;
	private readonly treeActions: TreeActionsProvider;
	private readonly requestReveal = this._register(new Emitter<InspectSubject>());

	public readonly onDidRequestReview = this.requestReveal.event;

	constructor(
		container: HTMLElement,
		onDidReveal: Event<{ subject: InspectSubject; preserveFocus: boolean }>,
		options: { showRevealLocationOnMessages: boolean; locationForProgress: string },
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ITestResultService results: ITestResultService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITestExplorerFilterState explorerFilter: ITestExplorerFilterState,
		@ITestCoverageService coverageService: ITestCoverageService,
		@IProgressService progressService: IProgressService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();

		this.treeActions = instantiationService.createInstance(TreeActionsProvider, options.showRevealLocationOnMessages, this.requestReveal,);
		const diffIdentityProvider: IIdentityProvider<TreeElement> = {
			getId(e: TreeElement) {
				return e.id;
			}
		};

		this.tree = this._register(instantiationService.createInstance(
			WorkbenchCompressibleObjectTree,
			'Test Output Peek',
			container,
			{
				getHeight: () => 22,
				getTemplateId: () => TestRunElementRenderer.ID,
			},
			[instantiationService.createInstance(TestRunElementRenderer, this.treeActions)],
			{
				compressionEnabled: true,
				hideTwistiesOfChildlessElements: true,
				identityProvider: diffIdentityProvider,
				alwaysConsumeMouseWheel: false,
				sorter: {
					compare(a, b) {
						if (a instanceof TestCaseElement && b instanceof TestCaseElement) {
							return cmpPriority(a.state, b.state);
						}

						return 0;
					},
				},
				accessibilityProvider: {
					getAriaLabel(element: ITreeElement) {
						return element.ariaLabel || element.label;
					},
					getWidgetAriaLabel() {
						return localize('testingPeekLabel', 'Test Result Messages');
					}
				}
			},
		)) as WorkbenchCompressibleObjectTree<TreeElement, FuzzyScore>;

		const cc = new CreationCache<TreeElement>();

		const getTaskChildren = (taskElem: TaskElement): Iterable<ICompressedTreeElement<TreeElement>> => {
			const { results, index, itemsCache, task } = taskElem;
			const tests = Iterable.filter(results.tests, test => test.tasks[index].state >= TestResultState.Running || test.tasks[index].messages.length > 0);
			let result: Iterable<ICompressedTreeElement<TreeElement>> = Iterable.map(tests, test => ({
				element: itemsCache.getOrCreate(test, () => new TestCaseElement(results, test, index)),
				incompressible: true,
				children: getTestChildren(results, test, index),
			}));

			if (task.coverage.get()) {
				result = Iterable.concat(
					Iterable.single<ICompressedTreeElement<TreeElement>>({
						element: new CoverageElement(results, task, coverageService),
						collapsible: true,
						incompressible: true,
					}),
					result,
				);
			}

			return result;
		};

		const getTestChildren = (result: ITestResult, test: TestResultItem, taskIndex: number): Iterable<ICompressedTreeElement<TreeElement>> => {
			return test.tasks[taskIndex].messages
				.map((m, messageIndex) =>
					m.type === TestMessageType.Error
						? { element: cc.getOrCreate(m, () => new TestMessageElement(result, test, taskIndex, messageIndex)), incompressible: false }
						: undefined
				)
				.filter(isDefined);
		};

		const getResultChildren = (result: ITestResult): ICompressedTreeElement<TreeElement>[] => {
			return result.tasks.map((task, taskIndex) => {
				const taskElem = cc.getOrCreate(task, () => new TaskElement(result, task, taskIndex));
				return ({
					element: taskElem,
					incompressible: false,
					collapsible: true,
					children: getTaskChildren(taskElem),
				});
			});
		};

		const getRootChildren = (): Iterable<ICompressedTreeElement<TreeElement>> => {
			let children: ICompressedTreeElement<TreeElement>[] = [];

			const older = [];

			for (const result of results.results) {
				if (!children.length && result.tasks.length) {
					children = getResultChildren(result);
				} else if (children) {
					const element = cc.getOrCreate(result, () => new TestResultElement(result));
					older.push({
						element,
						incompressible: true,
						collapsible: true,
						collapsed: this.tree.hasElement(element) ? this.tree.isCollapsed(element) : true,
						children: getResultChildren(result)
					});
				}
			}

			if (!children.length) {
				return older;
			}

			if (older.length) {
				children.push({
					element: new OlderResultsElement(older.length),
					incompressible: true,
					collapsible: true,
					collapsed: true,
					children: older,
				});
			}

			return children;
		};

		// Queued result updates to prevent spamming CPU when lots of tests are
		// completing and messaging quickly (#142514)
		const taskChildrenToUpdate = new Set<TaskElement>();
		const taskChildrenUpdate = this._register(new RunOnceScheduler(() => {
			for (const taskNode of taskChildrenToUpdate) {
				if (this.tree.hasElement(taskNode)) {
					this.tree.setChildren(taskNode, getTaskChildren(taskNode), { diffIdentityProvider });
				}
			}
			taskChildrenToUpdate.clear();
		}, 300));

		const queueTaskChildrenUpdate = (taskNode: TaskElement) => {
			taskChildrenToUpdate.add(taskNode);
			if (!taskChildrenUpdate.isScheduled()) {
				taskChildrenUpdate.schedule();
			}
		};

		const attachToResults = (result: LiveTestResult) => {
			const disposable = new DisposableStore();
			disposable.add(result.onNewTask(i => {
				this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });

				if (result.tasks.length === 1) {
					this.requestReveal.fire(new TaskSubject(result, 0)); // reveal the first task in new runs
				}

				// note: tasks are bounded and their lifetime is equivalent to that of
				// the test result, so this doesn't leak indefinitely.
				const task = result.tasks[i];
				disposable.add(autorun(reader => {
					task.coverage.read(reader); // add it to the autorun
					queueTaskChildrenUpdate(cc.get(task) as TaskElement);
				}));
			}));

			disposable.add(result.onEndTask(index => {
				(cc.get(result.tasks[index]) as TaskElement | undefined)?.changeEmitter.fire();
			}));

			disposable.add(result.onChange(e => {
				// try updating the item in each of its tasks
				for (const [index, task] of result.tasks.entries()) {
					const taskNode = cc.get(task) as TaskElement;
					if (!this.tree.hasElement(taskNode)) {
						continue;
					}

					const itemNode = taskNode.itemsCache.get(e.item);
					if (itemNode && this.tree.hasElement(itemNode)) {
						if (e.reason === TestResultItemChangeReason.NewMessage && e.message.type === TestMessageType.Error) {
							this.tree.setChildren(itemNode, getTestChildren(result, e.item, index), { diffIdentityProvider });
						}
						return;
					}

					queueTaskChildrenUpdate(taskNode);
				}
			}));

			disposable.add(result.onComplete(() => {
				(cc.get(result) as TestResultElement | undefined)?.changeEmitter.fire();
				disposable.dispose();
			}));
		};

		this._register(results.onResultsChanged(e => {
			// little hack here: a result change can cause the peek to be disposed,
			// but this listener will still be queued. Doing stuff with the tree
			// will cause errors.
			if (this.disposed) {
				return;
			}

			if ('completed' in e) {
				(cc.get(e.completed) as TestResultElement | undefined)?.changeEmitter.fire();
			} else if ('started' in e) {
				attachToResults(e.started);
			} else {
				this.tree.setChildren(null, getRootChildren(), { diffIdentityProvider });
			}
		}));

		const revealItem = (element: TreeElement, preserveFocus: boolean) => {
			this.tree.setFocus([element]);
			this.tree.setSelection([element]);
			if (!preserveFocus) {
				this.tree.domFocus();
			}
		};

		this._register(onDidReveal(async ({ subject, preserveFocus = false }) => {
			if (subject instanceof TaskSubject) {
				const resultItem = this.tree.getNode(null).children.find(c => {
					if (c.element instanceof TaskElement) {
						return c.element.results.id === subject.result.id && c.element.index === subject.taskIndex;
					}
					if (c.element instanceof TestResultElement) {
						return c.element.id === subject.result.id;
					}
					return false;
				});

				if (resultItem) {
					revealItem(resultItem.element!, preserveFocus);
				}
				return;
			}

			const revealElement = subject instanceof TestOutputSubject
				? cc.get<TaskElement>(subject.task)?.itemsCache.get(subject.test)
				: cc.get(subject.message);
			if (!revealElement || !this.tree.hasElement(revealElement)) {
				return;
			}

			const parents: TreeElement[] = [];
			for (let parent = this.tree.getParentElement(revealElement); parent; parent = this.tree.getParentElement(parent)) {
				parents.unshift(parent);
			}

			for (const parent of parents) {
				this.tree.expand(parent);
			}

			if (this.tree.getRelativeTop(revealElement) === null) {
				this.tree.reveal(revealElement, 0.5);
			}

			revealItem(revealElement, preserveFocus);
		}));

		this._register(this.tree.onDidOpen(async e => {
			if (e.element instanceof TestMessageElement) {
				this.requestReveal.fire(new MessageSubject(e.element.result, e.element.test, e.element.taskIndex, e.element.messageIndex));
			} else if (e.element instanceof TestCaseElement) {
				const t = e.element;
				const message = mapFindTestMessage(e.element.test, (_t, _m, mesasgeIndex, taskIndex) =>
					new MessageSubject(t.results, t.test, taskIndex, mesasgeIndex));
				this.requestReveal.fire(message || new TestOutputSubject(t.results, 0, t.test));
			} else if (e.element instanceof CoverageElement) {
				const task = e.element.task;
				if (e.element.isOpen) {
					return coverageService.closeCoverage();
				}
				progressService.withProgress(
					{ location: options.locationForProgress },
					() => coverageService.openCoverage(task, true)
				);
			}
		}));

		this._register(this.tree.onDidChangeSelection(evt => {
			for (const element of evt.elements) {
				if (element && 'test' in element) {
					explorerFilter.reveal.set(element.test.item.extId, undefined);
					break;
				}
			}
		}));

		this._register(explorerFilter.onDidSelectTestInExplorer(testId => {
			if (this.tree.getSelection().some(e => e && 'test' in e && e.test.item.extId === testId)) {
				return;
			}

			for (const node of this.tree.getNode(null).children) {
				if (node.element instanceof TaskElement) {
					for (const testNode of node.children) {
						if (testNode.element instanceof TestCaseElement && testNode.element.test.item.extId === testId) {
							this.tree.setSelection([testNode.element]);
							if (this.tree.getRelativeTop(testNode.element) === null) {
								this.tree.reveal(testNode.element, 0.5);
							}
							break;
						}
					}
				}
			}
		}));


		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		this._register(this.tree.onDidChangeCollapseState(e => {
			if (e.node.element instanceof OlderResultsElement && !e.node.collapsed) {
				telemetryService.publicLog2<{}, {
					owner: 'connor4312';
					// we're considering removing or depromoting this feature because we don't think it's used:
					comment: 'Records that test history was used';
				}>('testing.expandOlderResults');
			}
		}));

		this.tree.setChildren(null, getRootChildren());
		for (const result of results.results) {
			if (!result.completedAt && result instanceof LiveTestResult) {
				attachToResults(result);
			}
		}
	}

	public layout(height: number, width: number) {
		this.tree.layout(height, width);
	}

	private onContextMenu(evt: ITreeContextMenuEvent<ITreeElement | null>) {
		if (!evt.element) {
			return;
		}

		const actions = this.treeActions.provideActionBar(evt.element);
		this.contextMenuService.showContextMenu({
			getAnchor: () => evt.anchor,
			getActions: () => actions.secondary.length
				? [...actions.primary, new Separator(), ...actions.secondary]
				: actions.primary,
			getActionsContext: () => evt.element?.context
		});
	}

	public override dispose() {
		super.dispose();
		this.disposed = true;
	}
}

interface TemplateData {
	label: HTMLElement;
	icon: HTMLElement;
	actionBar: ActionBar;
	elementDisposable: DisposableStore;
	templateDisposable: DisposableStore;
}

class TestRunElementRenderer implements ICompressibleTreeRenderer<ITreeElement, FuzzyScore, TemplateData> {
	public static readonly ID = 'testRunElementRenderer';
	public readonly templateId = TestRunElementRenderer.ID;

	constructor(
		private readonly treeActions: TreeActionsProvider,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	/** @inheritdoc */
	public renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ITreeElement>, FuzzyScore>, _index: number, templateData: TemplateData): void {
		const chain = node.element.elements;
		const lastElement = chain[chain.length - 1];
		if ((lastElement instanceof TaskElement || lastElement instanceof TestMessageElement) && chain.length >= 2) {
			this.doRender(chain[chain.length - 2], templateData, lastElement);
		} else {
			this.doRender(lastElement, templateData);
		}
	}

	/** @inheritdoc */
	public renderTemplate(container: HTMLElement): TemplateData {
		const templateDisposable = new DisposableStore();
		container.classList.add('testing-stdtree-container');
		const icon = dom.append(container, dom.$('.state'));
		const label = dom.append(container, dom.$('.label'));

		const actionBar = new ActionBar(container, {
			actionViewItemProvider: (action, options) =>
				action instanceof MenuItemAction
					? this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate })
					: undefined
		});

		const elementDisposable = new DisposableStore();
		templateDisposable.add(elementDisposable);
		templateDisposable.add(actionBar);

		return {
			icon,
			label,
			actionBar,
			elementDisposable,
			templateDisposable,
		};
	}

	/** @inheritdoc */
	public renderElement(element: ITreeNode<ITreeElement, FuzzyScore>, _index: number, templateData: TemplateData): void {
		this.doRender(element.element, templateData);
	}

	/** @inheritdoc */
	public disposeTemplate(templateData: TemplateData): void {
		templateData.templateDisposable.dispose();
	}

	/** Called to render a new element */
	private doRender(element: ITreeElement, templateData: TemplateData, subjectElement?: ITreeElement) {
		templateData.elementDisposable.clear();
		templateData.elementDisposable.add(
			element.onDidChange(() => this.doRender(element, templateData, subjectElement)),
		);
		this.doRenderInner(element, templateData, subjectElement);
	}

	/** Called, and may be re-called, to render or re-render an element */
	private doRenderInner(element: ITreeElement, templateData: TemplateData, subjectElement: ITreeElement | undefined) {
		let { label, labelWithIcons, description } = element;
		if (subjectElement instanceof TestMessageElement) {
			description = subjectElement.label;
			if (element.description) {
				description = `${description} @ ${element.description}`;
			}
		}

		const descriptionElement = description ? dom.$('span.test-label-description', {}, description) : '';
		if (labelWithIcons) {
			dom.reset(templateData.label, ...labelWithIcons, descriptionElement);
		} else {
			dom.reset(templateData.label, label, descriptionElement);
		}

		const icon = element.icon;
		templateData.icon.className = `computed-state ${icon ? ThemeIcon.asClassName(icon) : ''}`;

		const actions = this.treeActions.provideActionBar(element);
		templateData.actionBar.clear();
		templateData.actionBar.context = element.context;
		templateData.actionBar.push(actions.primary, { icon: true, label: false });
	}
}

class TreeActionsProvider {
	constructor(
		private readonly showRevealLocationOnMessages: boolean,
		private readonly requestReveal: Emitter<InspectSubject>,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@ITestProfileService private readonly testProfileService: ITestProfileService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	public provideActionBar(element: ITreeElement) {
		const test = element instanceof TestCaseElement ? element.test : undefined;
		const capabilities = test ? this.testProfileService.capabilitiesForTest(test.item) : 0;

		const contextKeys: [string, unknown][] = [
			['peek', Testing.OutputPeekContributionId],
			[TestingContextKeys.peekItemType.key, element.type],
		];

		let id = MenuId.TestPeekElement;
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		if (element instanceof TaskElement) {
			primary.push(new Action(
				'testing.outputPeek.showResultOutput',
				localize('testing.showResultOutput', "Show Result Output"),
				ThemeIcon.asClassName(Codicon.terminal),
				undefined,
				() => this.requestReveal.fire(new TaskSubject(element.results, element.index)),
			));
			if (element.task.running) {
				primary.push(new Action(
					'testing.outputPeek.cancel',
					localize('testing.cancelRun', 'Cancel Test Run'),
					ThemeIcon.asClassName(icons.testingCancelIcon),
					undefined,
					() => this.commandService.executeCommand(TestCommandId.CancelTestRunAction, element.results.id, element.task.id),
				));
			} else {
				primary.push(new Action(
					'testing.outputPeek.rerun',
					localize('testing.reRunLastRun', 'Rerun Last Run'),
					ThemeIcon.asClassName(icons.testingRerunIcon),
					undefined,
					() => this.commandService.executeCommand(TestCommandId.ReRunLastRun, element.results.id),
				));

				const hasFailedTests = Iterable.some(element.results.tests, test => isFailedState(test.ownComputedState));
				if (hasFailedTests) {
					primary.push(new Action(
						'testing.outputPeek.rerunFailed',
						localize('testing.reRunFailedFromLastRun', 'Rerun Failed Tests'),
						ThemeIcon.asClassName(icons.testingRerunIcon),
						undefined,
						() => this.commandService.executeCommand(TestCommandId.ReRunFailedFromLastRun, element.results.id),
					));
				}

				primary.push(new Action(
					'testing.outputPeek.debug',
					localize('testing.debugLastRun', 'Debug Last Run'),
					ThemeIcon.asClassName(icons.testingDebugIcon),
					undefined,
					() => this.commandService.executeCommand(TestCommandId.DebugLastRun, element.results.id),
				));

				if (hasFailedTests) {
					primary.push(new Action(
						'testing.outputPeek.debugFailed',
						localize('testing.debugFailedFromLastRun', 'Debug Failed Tests'),
						ThemeIcon.asClassName(icons.testingDebugIcon),
						undefined,
						() => this.commandService.executeCommand(TestCommandId.DebugFailedFromLastRun, element.results.id),
					));
				}
			}
		}

		if (element instanceof TestResultElement) {
			// only show if there are no collapsed test nodes that have more specific choices
			if (element.value.tasks.length === 1) {
				primary.push(new Action(
					'testing.outputPeek.showResultOutput',
					localize('testing.showResultOutput', "Show Result Output"),
					ThemeIcon.asClassName(Codicon.terminal),
					undefined,
					() => this.requestReveal.fire(new TaskSubject(element.value, 0)),
				));
			}

			primary.push(new Action(
				'testing.outputPeek.reRunLastRun',
				localize('testing.reRunTest', "Rerun Test"),
				ThemeIcon.asClassName(icons.testingRunIcon),
				undefined,
				() => this.commandService.executeCommand('testing.reRunLastRun', element.value.id),
			));

			const hasFailedTests = Iterable.some(element.value.tests, test => isFailedState(test.ownComputedState));
			if (hasFailedTests) {
				primary.push(new Action(
					'testing.outputPeek.rerunFailedResult',
					localize('testing.reRunFailedFromLastRun', 'Rerun Failed Tests'),
					ThemeIcon.asClassName(icons.testingRerunIcon),
					undefined,
					() => this.commandService.executeCommand(TestCommandId.ReRunFailedFromLastRun, element.value.id),
				));
			}

			if (capabilities & TestRunProfileBitset.Debug) {
				primary.push(new Action(
					'testing.outputPeek.debugLastRun',
					localize('testing.debugTest', "Debug Test"),
					ThemeIcon.asClassName(icons.testingDebugIcon),
					undefined,
					() => this.commandService.executeCommand('testing.debugLastRun', element.value.id),
				));

				if (hasFailedTests) {
					primary.push(new Action(
						'testing.outputPeek.debugFailedResult',
						localize('testing.debugFailedFromLastRun', 'Debug Failed Tests'),
						ThemeIcon.asClassName(icons.testingDebugIcon),
						undefined,
						() => this.commandService.executeCommand(TestCommandId.DebugFailedFromLastRun, element.value.id),
					));
				}
			}
		}

		if (element instanceof TestCaseElement || element instanceof TestMessageElement) {
			contextKeys.push(
				[TestingContextKeys.testResultOutdated.key, element.test.retired],
				[TestingContextKeys.testResultState.key, testResultStateToContextValues[element.test.ownComputedState]],
				...getTestItemContextOverlay(element.test, capabilities),
			);

			const { extId, uri } = element.test.item;
			if (uri) {
				primary.push(new Action(
					'testing.outputPeek.goToTest',
					localize('testing.goToTest', "Go to Test"),
					ThemeIcon.asClassName(Codicon.goToFile),
					undefined,
					() => this.commandService.executeCommand('vscode.revealTest', extId),
				));
			}

			if (element.test.tasks[element.taskIndex].messages.some(m => m.type === TestMessageType.Output)) {
				primary.push(new Action(
					'testing.outputPeek.showResultOutput',
					localize('testing.showResultOutput', "Show Result Output"),
					ThemeIcon.asClassName(Codicon.terminal),
					undefined,
					() => this.requestReveal.fire(element.outputSubject),
				));
			}

			secondary.push(new Action(
				'testing.outputPeek.revealInExplorer',
				localize('testing.revealInExplorer', "Reveal in Test Explorer"),
				ThemeIcon.asClassName(Codicon.listTree),
				undefined,
				() => this.commandService.executeCommand('_revealTestInExplorer', extId),
			));

			if (capabilities & TestRunProfileBitset.Run) {
				primary.push(new Action(
					'testing.outputPeek.runTest',
					localize('run test', 'Run Test'),
					ThemeIcon.asClassName(icons.testingRunIcon),
					undefined,
					() => this.commandService.executeCommand('vscode.runTestsById', TestRunProfileBitset.Run, extId),
				));
			}

			if (capabilities & TestRunProfileBitset.Debug) {
				primary.push(new Action(
					'testing.outputPeek.debugTest',
					localize('debug test', 'Debug Test'),
					ThemeIcon.asClassName(icons.testingDebugIcon),
					undefined,
					() => this.commandService.executeCommand('vscode.runTestsById', TestRunProfileBitset.Debug, extId),
				));
			}

		}

		if (element instanceof TestMessageElement) {
			id = MenuId.TestMessageContext;
			contextKeys.push([TestingContextKeys.testMessageContext.key, element.contextValue]);

			if (this.showRevealLocationOnMessages && element.location) {
				primary.push(new Action(
					'testing.outputPeek.goToError',
					localize('testing.goToError', "Go to Error"),
					ThemeIcon.asClassName(Codicon.debugStackframe),
					undefined,
					() => this.editorService.openEditor({
						resource: element.location!.uri,
						options: {
							selection: element.location!.range,
							preserveFocus: true,
						}
					}),
				));
			}
		}


		const contextOverlay = this.contextKeyService.createOverlay(contextKeys);
		const result = { primary, secondary };
		const menu = this.menuService.getMenuActions(id, contextOverlay, { arg: element.context });
		fillInActionBarActions(menu, result, 'inline');
		return result;
	}
}

class CreationCache<T> {
	private readonly v = new WeakMap<object, T>();

	public get<T2 extends T = T>(key: object): T2 | undefined {
		return this.v.get(key) as T2 | undefined;
	}

	public getOrCreate<T2 extends T>(ref: object, factory: () => T2): T2 {
		const existing = this.v.get(ref);
		if (existing) {
			return existing as T2;
		}

		const fresh = factory();
		this.v.set(ref, fresh);
		return fresh;
	}
}

const firstLine = (str: string) => {
	const index = str.indexOf('\n');
	return index === -1 ? str : str.slice(0, index);
};
