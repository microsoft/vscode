/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $, append, isHTMLElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IOverlayWidget } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ScrollType } from '../../../../../editor/common/editorCommon.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ICodeReviewService, IPRReviewState, PRReviewStateKind } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorWidgetContribution } from '../../browser/agentFeedbackEditorWidgetContribution.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackChangeEvent, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';

suite('AgentFeedbackEditorWidgetContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function pressEnter(target: HTMLElement): void {
		const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => 13 });
		target.dispatchEvent(event);
	}

	test('keeps grouped navigation visible without remeasuring previews on editor scroll', () => {
		const session = URI.parse('test://session/grouped-navigation');
		const navigation = store.add(new Emitter<URI>());
		let activeIdx = -1;
		let feedback: readonly IAgentFeedback[] = [];
		const services = new ServiceCollection();
		services.set(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = Event.None;
			override readonly onDidChangeFeedbackVisibility = Event.None;
			override readonly onDidChangeFeedbackScope = Event.None;
			override readonly onDidChangeNavigation = navigation.event;
			override getFeedbackSessionResource(): URI { return session; }
			override getFeedback(): readonly IAgentFeedback[] { return feedback; }
			override getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(); }
			override isAgentHostSession(): boolean { return true; }
			override hasLoadedFeedback(): boolean { return true; }
			override getChatChanges() { return []; }
			override getNavigationBearing() { return { activeIdx, totalCount: feedback.length }; }
		});
		const prState = constObservable<IPRReviewState>({ kind: PRReviewStateKind.None });
		services.set(ICodeReviewService, new class extends mock<ICodeReviewService>() {
			override getPRReviewState() { return prState; }
		});
		services.set(IContextMenuService, new class extends mock<IContextMenuService>() { }());
		services.set(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = Event.None;
			override readonly currentDefaultAccount = null;
		});
		services.set(IMarkdownRendererService, new SyncDescriptor(MarkdownRendererService));
		const states: { codeVisible: boolean; stackVisible: boolean; cardVisible: boolean }[] = [];
		let firstAnchorAboveViewport = false;
		let offscreenGroupHidden = false;
		let previewMutations = -1;
		const lines = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`);
		withTestCodeEditor(lines, { serviceCollection: services }, (testEditor, _viewModel, instantiationService) => {
			const disposables = store.add(new DisposableStore());
			const container = append(mainWindow.document.body, $('div'));
			container.style.width = '760px';
			container.style.height = '420px';
			const editor = disposables.add(instantiationService.createInstance(CodeEditorWidget, container, {
				dimension: { width: 760, height: 420 },
				fontSize: 13,
				lineHeight: 20,
				minimap: { enabled: false },
				scrollBeyondLastLine: false,
				smoothScrolling: false,
			}, { contributions: [] }));
			editor.setModel(testEditor.getModel());
			editor.render();
			feedback = Array.from({ length: 10 }, (_, index) => ({
				id: `feedback-${index}`,
				text: 'A detailed review comment that must remain readable while navigating between the nearby code ranges. '.repeat(4),
				sessionResource: session,
				resourceUri: editor.getModel()!.uri,
				range: { startLineNumber: 2 + index * 4, startColumn: 1, endLineNumber: 2 + index * 4, endColumn: 1 },
				kind: AgentFeedbackKind.UserReview,
				state: AgentFeedbackState.Accepted,
			}));
			let contribution: AgentFeedbackEditorWidgetContribution | undefined;
			try {
				contribution = disposables.add(instantiationService.createInstance(AgentFeedbackEditorWidgetContribution, editor));
				const navigate = (index: number) => {
					activeIdx = index;
					navigation.fire(session);
					editor.render();
					const widget = container.querySelector<HTMLElement>('.agent-feedback-widget')!;
					const card = widget.querySelector<HTMLElement>('.agent-feedback-widget-item.focused')!;
					const editorBounds = editor.getDomNode()!.getBoundingClientRect();
					const widgetBounds = widget.getBoundingClientRect();
					const cardBounds = card.getBoundingClientRect();
					const layout = editor.getLayoutInfo();
					const viewportBottom = editorBounds.top + layout.height - layout.horizontalScrollbarHeight;
					const code = editor.getScrolledVisiblePosition({ lineNumber: feedback[index].range.startLineNumber, column: 1 });
					states.push({
						codeVisible: code !== null && code.top >= 0 && editorBounds.top + code.top < viewportBottom,
						stackVisible: widgetBounds.top >= editorBounds.top && widgetBounds.bottom <= viewportBottom + 1,
						cardVisible: cardBounds.top >= editorBounds.top && cardBounds.bottom <= viewportBottom + 1,
					});
				};
				navigate(9);
				firstAnchorAboveViewport = editor.getTopForLineNumber(feedback[0].range.startLineNumber) < editor.getScrollTop();
				const observer = new mainWindow.MutationObserver(() => { });
				const observation = disposables.add(toDisposable(() => observer.disconnect()));
				for (const text of container.querySelectorAll('.agent-feedback-widget-text')) {
					observer.observe(text, { attributes: true, attributeFilter: ['class'] });
				}
				for (let index = 0; index < 3; index++) {
					editor.setScrollTop(editor.getScrollTop() + 20, ScrollType.Immediate);
					editor.render();
				}
				previewMutations = observer.takeRecords().length;
				observation.dispose();
				navigate(0);
				editor.setScrollTop(editor.getScrollHeight(), ScrollType.Immediate);
				editor.render();
				offscreenGroupHidden = container.querySelector('.agent-feedback-widget')!.getBoundingClientRect().bottom <= editor.getDomNode()!.getBoundingClientRect().top;
			} finally {
				contribution?.dispose();
				disposables.dispose();
				container.remove();
			}
		});
		const visible = { codeVisible: true, stackVisible: true, cardVisible: true };
		assert.deepStrictEqual({ states, firstAnchorAboveViewport, offscreenGroupHidden, previewMutations }, { states: [visible, visible], firstAnchorAboveViewport: true, offscreenGroupHidden: true, previewMutations: 0 });
	});

	for (const readonlyState of [AgentFeedbackState.Submitted, AgentFeedbackState.Resolved]) {
		for (const composer of ['edit', 'reply']) {
			test(`suspends and retains the ${composer} draft when feedback becomes ${readonlyState}`, () => {
				const session = URI.parse('test://session/review-drafts');
				const changes = store.add(new Emitter<IAgentFeedbackChangeEvent>());
				let feedback: readonly IAgentFeedback[] = [];
				let menuActions: readonly IAction[] = [];
				const mutations: string[] = [];
				const services = new ServiceCollection();
				services.set(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
					override readonly onDidChangeFeedback = changes.event;
					override readonly onDidChangeFeedbackVisibility = Event.None;
					override readonly onDidChangeFeedbackScope = Event.None;
					override readonly onDidChangeNavigation = Event.None;
					override getFeedbackSessionResource(): URI { return session; }
					override getFeedback(): readonly IAgentFeedback[] { return feedback; }
					override getVisibleResolvedFeedbackIds(): ReadonlySet<string> { return new Set(['feedback-1']); }
					override isAgentHostSession(): boolean { return true; }
					override hasLoadedFeedback(): boolean { return true; }
					override getChatChanges() { return []; }
					override getNavigationBearing() { return { activeIdx: -1, totalCount: feedback.length }; }
					override updateFeedback(_session: URI, _id: string, text: string): void { mutations.push(`edit:${text}`); }
					override addReply(_session: URI, _id: string, text: string): void { mutations.push(`reply:${text}`); }
				});
				const prState = constObservable<IPRReviewState>({ kind: PRReviewStateKind.None });
				services.set(ICodeReviewService, new class extends mock<ICodeReviewService>() {
					override getPRReviewState() { return prState; }
				});
				services.set(IContextMenuService, new class extends mock<IContextMenuService>() {
					override showContextMenu(delegate: Parameters<IContextMenuService['showContextMenu']>[0]): void {
						assert.ok(delegate.getActions);
						menuActions = delegate.getActions();
					}
				});
				services.set(IDefaultAccountService, new class extends mock<IDefaultAccountService>() {
					override readonly onDidChangeDefaultAccount = Event.None;
					override readonly currentDefaultAccount = null;
				});
				services.set(IMarkdownRendererService, new SyncDescriptor(MarkdownRendererService));

				withTestCodeEditor(['first line', 'second line'], { serviceCollection: services, envConfig: { outerWidth: 760, outerHeight: 420 } }, (editor, _viewModel, instantiationService) => {
					const disposables = store.add(new DisposableStore());
					const sandbox = sinon.createSandbox();
					disposables.add(toDisposable(() => sandbox.restore()));
					const container = append(mainWindow.document.body, $('div'));
					const widgets = new Map<string, IOverlayWidget>();
					sandbox.stub(editor, 'addOverlayWidget').callsFake(widget => {
						widgets.set(widget.getId(), widget);
						append(container, widget.getDomNode());
					});
					sandbox.stub(editor, 'removeOverlayWidget').callsFake(widget => {
						widget.getDomNode().remove();
						widgets.delete(widget.getId());
					});
					feedback = [{
						id: 'feedback-1', text: 'Original comment', sessionResource: session,
						resourceUri: editor.getModel()!.uri,
						range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
						kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted,
					}];
					const domNode = () => {
						assert.strictEqual(widgets.size, 1);
						return [...widgets.values()][0].getDomNode();
					};
					const updateState = (state: AgentFeedbackState) => {
						feedback = [{ ...feedback[0], state }];
						changes.fire({ sessionResource: session, feedbackItems: feedback });
					};
					let contribution: AgentFeedbackEditorWidgetContribution | undefined;
					try {
						contribution = disposables.add(instantiationService.createInstance(AgentFeedbackEditorWidgetContribution, editor));
						if (composer === 'edit') {
							domNode().querySelector<HTMLElement>('.codicon-agent-feedback-edit')!.click();
						} else {
							pressEnter(domNode().querySelector<HTMLElement>('.codicon-agent-feedback-more')!);
							const action = menuActions.find(action => action.id === 'agentFeedback.widget.addReply');
							assert.ok(action);
							void action.run();
						}
						const input = domNode().querySelector<HTMLTextAreaElement>('textarea')!;
						assert.ok(input);
						input.value = 'Retained draft';
						input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
						updateState(readonlyState);
						const active = mainWindow.document.activeElement;
						if (isHTMLElement(active)) {
							pressEnter(active);
						}
						const suspended = {
							composers: domNode().querySelectorAll('textarea').length,
							actions: [...domNode().querySelectorAll('.agent-feedback-widget-item-actions .action-label')].map(action => action.getAttribute('aria-label')),
							mutations: [...mutations],
						};
						updateState(AgentFeedbackState.Accepted);

						assert.deepStrictEqual({
							suspended,
							restoredDraft: domNode().querySelector<HTMLTextAreaElement>('textarea')?.value,
						}, {
							suspended: { composers: 0, actions: readonlyState === AgentFeedbackState.Submitted ? [] : ['Hide'], mutations: [] },
							restoredDraft: 'Retained draft',
						});
					} finally {
						contribution?.dispose();
						disposables.dispose();
						container.remove();
					}
				});
			});
		}
	}
});
