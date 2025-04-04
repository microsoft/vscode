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
import { InlineCompletion, InlineCompletionContext, InlineCompletionsProvider } from '../../../../common/languages.js';
import { ITestCodeEditor, TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { InlineCompletionsModel } from '../../browser/model/inlineCompletionsModel.js';
import { autorun } from '../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { LanguageFeaturesService } from '../../../../common/services/languageFeaturesService.js';
import { ViewModel } from '../../../../common/viewModel/viewModelImpl.js';
import { InlineCompletionsController } from '../../browser/controller/inlineCompletionsController.js';

export class MockInlineCompletionsProvider implements InlineCompletionsProvider {
	private returnValue: InlineCompletion[] = [];
	private delayMs: number = 0;

	private callHistory = new Array<unknown>();
	private calledTwiceIn50Ms = false;

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

	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken) {
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

		return { items: result };
	}
	freeInlineCompletions() { }
	handleItemDidShow() { }
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
		CoreNavigationCommands.CursorUp.runEditorCommand(null, this.editor, null);
	}

	public cursorRight(): void {
		CoreNavigationCommands.CursorRight.runEditorCommand(null, this.editor, null);
	}

	public cursorLeft(): void {
		CoreNavigationCommands.CursorLeft.runEditorCommand(null, this.editor, null);
	}

	public cursorDown(): void {
		CoreNavigationCommands.CursorDown.runEditorCommand(null, this.editor, null);
	}

	public cursorLineEnd(): void {
		CoreNavigationCommands.CursorLineEnd.runEditorCommand(null, this.editor, null);
	}

	public leftDelete(): void {
		CoreEditingCommands.DeleteLeft.runEditorCommand(null, this.editor, null);
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
				options.serviceCollection.set(IAccessibilitySignalService, {
					playSignal: async () => { },
					isSoundEnabled(signal: unknown) { return false; },
				} as any);
				const d = languageFeaturesService.inlineCompletionsProvider.register({ pattern: '**' }, options.provider);
				disposableStore.add(d);
			}

			let result: T;
			await withAsyncTestCodeEditor(text, options, async (editor, editorViewModel, instantiationService) => {
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
