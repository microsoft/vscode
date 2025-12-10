/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { CoreEditingCommands, CoreNavigationCommands } from '../../../../browser/coreCommands.js';
import { Position } from '../../../../common/core/position.js';
import { ITextModel } from '../../../../common/model.js';
import { InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider } from '../../../../common/languages.js';
import { ITestCodeEditor, TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { InlineCompletionsModel } from '../../browser/model/inlineCompletionsModel.js';
import { autorun, derived } from '../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { ViewModel } from '../../../../common/viewModel/viewModelImpl.js';
import { InlineCompletionsController } from '../../browser/controller/inlineCompletionsController.js';
import { Range } from '../../../../common/core/range.js';
import { TextEdit } from '../../../../common/core/edits/textEdit.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { PositionOffsetTransformer } from '../../../../common/core/text/positionToOffset.js';
import { InlineSuggestionsView } from '../../browser/view/inlineSuggestionsView.js';
import { IBulkEditService } from '../../../../browser/services/bulkEditService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { Event } from '../../../../../base/common/event.js';

export class MockInlineCompletionsProvider implements InlineCompletionsProvider {
	private returnValue: InlineCompletion[] = [];
	private delayMs: number = 0;

	private callHistory = new Array<unknown>();
	private calledTwiceIn50Ms = false;

	constructor(
		public readonly enableForwardStability = false,
	) { }

	public setReturnValue(value: InlineCompletion | undefined, delayMs: number = 0): void {
		this.returnValue = value ? [value] : [];
		this.delayMs = delayMs;
	}

	public setReturnValues(values: InlineCompletion[], delayMs: number = 0): void {
		this.returnValue = values;
		this.delayMs = delayMs;
	}

	public getAndClearCallHistory() {
		const history = [...this.callHistory];
		this.callHistory = [];
		return history;
	}

	public assertNotCalledTwiceWithin50ms() {
		if (this.calledTwiceIn50Ms) {
			throw new Error('provideInlineCompletions has been called at least twice within 50ms. This should not happen.');
		}
	}

	private lastTimeMs: number | undefined = undefined;

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<InlineCompletions> {
		const currentTimeMs = new Date().getTime();
		if (this.lastTimeMs && currentTimeMs - this.lastTimeMs < 50) {
			this.calledTwiceIn50Ms = true;
		}
		this.lastTimeMs = currentTimeMs;

		this.callHistory.push({
			position: position.toString(),
			triggerKind: context.triggerKind,
			text: model.getValue()
		});
		const result = new Array<InlineCompletion>();
		for (const v of this.returnValue) {
			const x = { ...v };
			if (!x.range) {
				x.range = model.getFullModelRange();
			}
			result.push(x);
		}

		if (this.delayMs > 0) {
			await timeout(this.delayMs);
		}

		return { items: result, enableForwardStability: this.enableForwardStability };
	}
	disposeInlineCompletions() { }
	handleItemDidShow() { }
}

export class MockSearchReplaceCompletionsProvider implements InlineCompletionsProvider {
	private _map = new Map<string, string>();

	public add(search: string, replace: string): void {
		this._map.set(search, replace);
	}

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<InlineCompletions> {
		const text = model.getValue();
		for (const [search, replace] of this._map) {
			const idx = text.indexOf(search);
			// replace idx...idx+text.length with replace
			if (idx !== -1) {
				const range = Range.fromPositions(model.getPositionAt(idx), model.getPositionAt(idx + search.length));
				return {
					items: [
						{ range, insertText: replace, isInlineEdit: true }
					]
				};
			}
		}
		return { items: [] };
	}
	disposeInlineCompletions() { }
	handleItemDidShow() { }
}

export class InlineEditContext extends Disposable {
	public readonly prettyViewStates = new Array<string | undefined>();

	constructor(model: InlineCompletionsModel, private readonly editor: ITestCodeEditor) {
		super();

		const edit = derived(reader => {
			const state = model.state.read(reader);
			return state ? new TextEdit(state.edits) : undefined;
		});

		this._register(autorun(reader => {
			/** @description update */
			const e = edit.read(reader);
			let view: string | undefined;

			if (e) {
				view = e.toString(this.editor.getValue());
			} else {
				view = undefined;
			}

			this.prettyViewStates.push(view);
		}));
	}

	public getAndClearViewStates(): (string | undefined)[] {
		const arr = [...this.prettyViewStates];
		this.prettyViewStates.length = 0;
		return arr;
	}
}

export class GhostTextContext extends Disposable {
	public readonly prettyViewStates = new Array<string | undefined>();
	private _currentPrettyViewState: string | undefined;
	public get currentPrettyViewState() {
		return this._currentPrettyViewState;
	}

	constructor(model: InlineCompletionsModel, private readonly editor: ITestCodeEditor) {
		super();

		this._register(autorun(reader => {
			/** @description update */
			const ghostText = model.primaryGhostText.read(reader);
			let view: string | undefined;
			if (ghostText) {
				view = ghostText.render(this.editor.getValue(), true);
			} else {
				view = this.editor.getValue();
			}

			if (this._currentPrettyViewState !== view) {
				this.prettyViewStates.push(view);
			}
			this._currentPrettyViewState = view;
		}));
	}

	public getAndClearViewStates(): (string | undefined)[] {
		const arr = [...this.prettyViewStates];
		this.prettyViewStates.length = 0;
		return arr;
	}

	public keyboardType(text: string): void {
		this.editor.trigger('keyboard', 'type', { text });
	}

	public cursorUp(): void {
		this.editor.runCommand(CoreNavigationCommands.CursorUp, null);
	}

	public cursorRight(): void {
		this.editor.runCommand(CoreNavigationCommands.CursorRight, null);
	}

	public cursorLeft(): void {
		this.editor.runCommand(CoreNavigationCommands.CursorLeft, null);
	}

	public cursorDown(): void {
		this.editor.runCommand(CoreNavigationCommands.CursorDown, null);
	}

	public cursorLineEnd(): void {
		this.editor.runCommand(CoreNavigationCommands.CursorLineEnd, null);
	}

	public leftDelete(): void {
		this.editor.runCommand(CoreEditingCommands.DeleteLeft, null);
	}
}

export interface IWithAsyncTestCodeEditorAndInlineCompletionsModel {
	editor: ITestCodeEditor;
	editorViewModel: ViewModel;
	model: InlineCompletionsModel;
	context: GhostTextContext;
	store: DisposableStore;
}

export async function withAsyncTestCodeEditorAndInlineCompletionsModel<T>(
	text: string,
	options: TestCodeEditorInstantiationOptions & { provider?: InlineCompletionsProvider; fakeClock?: boolean },
	callback: (args: IWithAsyncTestCodeEditorAndInlineCompletionsModel) => Promise<T>): Promise<T> {
	return await runWithFakedTimers({
		useFakeTimers: options.fakeClock,
	}, async () => {
		const disposableStore = new DisposableStore();

		try {
			if (options.provider) {
				const languageFeaturesService = new LanguageFeaturesService();
				if (!options.serviceCollection) {
					options.serviceCollection = new ServiceCollection();
				}
				options.serviceCollection.set(ILanguageFeaturesService, languageFeaturesService);
				// eslint-disable-next-line local/code-no-any-casts
				options.serviceCollection.set(IAccessibilitySignalService, {
					playSignal: async () => { },
					isSoundEnabled(signal: unknown) { return false; },
				} as any);
				options.serviceCollection.set(IBulkEditService, {
					apply: async () => { throw new Error('IBulkEditService.apply not implemented'); },
					hasPreviewHandler: () => { throw new Error('IBulkEditService.hasPreviewHandler not implemented'); },
					setPreviewHandler: () => { throw new Error('IBulkEditService.setPreviewHandler not implemented'); },
					_serviceBrand: undefined,
				});
				options.serviceCollection.set(IDefaultAccountService, {
					_serviceBrand: undefined,
					onDidChangeDefaultAccount: Event.None,
					getDefaultAccount: async () => null,
					setDefaultAccount: () => { },
				});

				const d = languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, options.provider);
				disposableStore.add(d);
			}

			let result: T;
			await withAsyncTestCodeEditor(text, options, async (editor, editorViewModel, instantiationService) => {
				instantiationService.stubInstance(InlineSuggestionsView, {
					shouldShowHoverAtViewZone: () => false,
					dispose: () => { },
				});
				const controller = instantiationService.createInstance(InlineCompletionsController, editor);
				const model = controller.model.get()!;
				const context = new GhostTextContext(model, editor);
				try {
					result = await callback({ editor, editorViewModel, model, context, store: disposableStore });
				} finally {
					context.dispose();
					model.dispose();
					controller.dispose();
				}
			});

			if (options.provider instanceof MockInlineCompletionsProvider) {
				options.provider.assertNotCalledTwiceWithin50ms();
			}

			return result!;
		} finally {
			disposableStore.dispose();
		}
	});
}

export class AnnotatedString {
	public readonly value: string;
	public readonly markers: { mark: string; idx: number }[];

	constructor(src: string, annotations: string[] = ['↓']) {
		const markers = findMarkers(src, annotations);
		this.value = markers.textWithoutMarkers;
		this.markers = markers.results;
	}

	getMarkerOffset(markerIdx = 0): number {
		if (markerIdx >= this.markers.length) {
			throw new BugIndicatingError(`Marker index ${markerIdx} out of bounds`);
		}
		return this.markers[markerIdx].idx;
	}
}

function findMarkers(text: string, markers: string[]): {
	results: { mark: string; idx: number }[];
	textWithoutMarkers: string;
} {
	const results: { mark: string; idx: number }[] = [];
	let textWithoutMarkers = '';

	markers.sort((a, b) => b.length - a.length);

	let pos = 0;
	for (let i = 0; i < text.length;) {
		let foundMarker = false;
		for (const marker of markers) {
			if (text.startsWith(marker, i)) {
				results.push({ mark: marker, idx: pos });
				i += marker.length;
				foundMarker = true;
				break;
			}
		}
		if (!foundMarker) {
			textWithoutMarkers += text[i];
			pos++;
			i++;
		}
	}

	return { results, textWithoutMarkers };
}

export class AnnotatedText extends AnnotatedString {
	private readonly _transformer = new PositionOffsetTransformer(this.value);

	getMarkerPosition(markerIdx = 0): Position {
		return this._transformer.getPosition(this.getMarkerOffset(markerIdx));
	}
}
