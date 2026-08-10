/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDelayedHoverOptions, IHoverLifecycleOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NewChatInputWidget } from '../../browser/newChatInput.js';
import { INewSessionPromptOption, NewSessionPromptOptionsState } from '../../browser/newSessionComposerService.js';
import { NewSessionPromptOptionsWidget } from '../../browser/newSessionPromptOptions.js';

interface IPromptOptionsRefreshHarness {
	readonly _promptOptionsRefresh: MutableDisposable<CancellationTokenSource>;
	readonly _promptOptionsResolver: (token: CancellationToken) => Promise<NewSessionPromptOptionsState>;
	preparePromptOptionsRefresh(): boolean;
	showPromptOptions(state: NewSessionPromptOptionsState | undefined): boolean;
}

interface IReplacePromptHarness {
	readonly _editor: {
		getModel(): {
			getValue(): string;
			getFullModelRange(): object;
			getLineCount(): number;
			getLineMaxColumn(lineNumber: number): number;
		};
		pushUndoStop(): void;
		executeEdits(source: string, edits: readonly { readonly text: string }[]): boolean;
		setPosition(position: { readonly lineNumber: number; readonly column: number }): void;
	};
	readonly _promptTypingAnimation: { clear(): void };
	readonly _promptTemplatePlaceholder: { readonly value: { setPlaceholder(placeholder: string): void } };
}

const refreshPromptOptions = Reflect.get(NewChatInputWidget.prototype, 'refreshPromptOptions') as (this: IPromptOptionsRefreshHarness, token?: CancellationToken) => Promise<boolean>;
const replacePrompt = Reflect.get(NewChatInputWidget.prototype, '_replacePrompt') as (this: IReplacePromptHarness, text: string, placeholder: string, expectedValue: string) => boolean;

class TestHoverService extends mock<IHoverService>() {
	readonly contents: string[] = [];

	override setupDelayedHover(
		_target: HTMLElement,
		hoverOptions: (() => IDelayedHoverOptions) | IDelayedHoverOptions,
		_lifecycleOptions?: IHoverLifecycleOptions,
	): IDisposable {
		const options = typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions;
		const content = options.content;
		if (typeof content === 'string') {
			this.contents.push(content);
		} else if (isMarkdownString(content)) {
			this.contents.push(content.value.replaceAll('&nbsp;', ' '));
		}
		return Disposable.None;
	}
}

suite('NewSessionPromptOptionsWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders loading and preserves selection while user edits disable replacement', async () => {
		const container = document.createElement('div');
		const hoverService = new TestHoverService();
		const selections: { readonly optionId: string; readonly expectedInput: string; readonly animate: boolean }[] = [];
		let inputValue = '';
		const widget = disposables.add(new NewSessionPromptOptionsWidget(container, async (option, expectedInput, animate) => {
			selections.push({ optionId: option.id, expectedInput, animate });
			inputValue = option.prompt;
			widget.setInputValue(inputValue);
			return true;
		}, hoverService));
		const options = [option('feature', 'Implement a feature'), option('bug', 'Fix a bug')];

		widget.setState({ kind: 'loading' });
		const loading = {
			busy: widget.element.getAttribute('aria-busy'),
			skeletons: widget.element.querySelectorAll('.new-session-prompt-option-skeleton').length,
		};

		widget.setState({ kind: 'resolved', options });
		const buttons = Array.from(widget.element.querySelectorAll<HTMLElement>('.monaco-button.new-session-prompt-option'));
		buttons[0].click();
		await timeout(0);
		const selected = snapshotButtons(buttons);

		const promptWithoutPlaceholder = options[0].prompt.replace(options[0].placeholder, '');
		widget.setInputValue(promptWithoutPlaceholder);
		const placeholderRemoved = snapshotButtons(buttons);
		buttons[1].click();
		await timeout(0);
		const replaced = snapshotButtons(buttons);

		widget.setInputValue(`${inputValue} with an edit`);
		const edited = snapshotButtons(buttons);

		widget.setInputValue(options[1].prompt);
		const restored = snapshotButtons(buttons);

		widget.setInputValue('');
		const empty = snapshotButtons(buttons);

		assert.deepStrictEqual({
			loading,
			hoverContents: hoverService.contents,
			selections,
			selected,
			placeholderRemoved,
			replaced,
			edited,
			restored,
			empty,
		}, {
			loading: { busy: 'true', skeletons: 3 },
			hoverContents: [
				'**Implement a feature**\n\nDescription for Implement a feature',
				'**Fix a bug**\n\nDescription for Fix a bug',
			],
			selections: [
				{ optionId: 'feature', expectedInput: '', animate: true },
				{ optionId: 'bug', expectedInput: 'Prompt for Implement a feature: ', animate: false },
			],
			selected: [
				{ selected: true, disabled: false },
				{ selected: false, disabled: false },
			],
			placeholderRemoved: [
				{ selected: true, disabled: false },
				{ selected: false, disabled: false },
			],
			replaced: [
				{ selected: false, disabled: false },
				{ selected: true, disabled: false },
			],
			edited: [
				{ selected: false, disabled: true },
				{ selected: true, disabled: true },
			],
			restored: [
				{ selected: false, disabled: false },
				{ selected: true, disabled: false },
			],
			empty: [
				{ selected: false, disabled: false },
				{ selected: true, disabled: false },
			],
		});
	});

	test('renders title details separately while preserving full accessible text', () => {
		const container = document.createElement('div');
		const hoverService = new TestHoverService();
		const widget = disposables.add(new NewSessionPromptOptionsWidget(container, async () => true, hoverService));
		const gitHubOption: INewSessionPromptOption = {
			...option('issue', 'Tackle issue'),
			titleDetail: '#123',
			description: 'A complete issue title',
		};

		widget.setState({ kind: 'resolved', options: [gitHubOption] });
		const button = widget.element.querySelector<HTMLElement>('.new-session-prompt-option');

		assert.deepStrictEqual({
			title: button?.querySelector('.new-session-prompt-option-title-label')?.textContent,
			detail: button?.querySelector('.new-session-prompt-option-title-detail')?.textContent,
			ariaLabel: button?.getAttribute('aria-label'),
			hover: hoverService.contents,
		}, {
			title: 'Tackle issue',
			detail: '#123',
			ariaLabel: 'Tackle issue #123: A complete issue title',
			hover: ['**Tackle issue \\#123**\n\nA complete issue title'],
		});
	});

	test('cancels stale prompt option refreshes', async () => {
		const first = new DeferredPromise<NewSessionPromptOptionsState>();
		const tokens: CancellationToken[] = [];
		const states: NewSessionPromptOptionsState[] = [];
		let requestCount = 0;
		const refresh = disposables.add(new MutableDisposable<CancellationTokenSource>());
		const harness: IPromptOptionsRefreshHarness = {
			_promptOptionsRefresh: refresh,
			_promptOptionsResolver: token => {
				tokens.push(token);
				requestCount++;
				return requestCount === 1 ? first.p : Promise.resolve({ kind: 'resolved', options: [option('bug', 'Fix a bug')] });
			},
			preparePromptOptionsRefresh: () => {
				refresh.value?.cancel();
				refresh.clear();
				states.push({ kind: 'loading' });
				return true;
			},
			showPromptOptions: state => {
				if (state) {
					states.push(state);
				}
				return true;
			},
		};

		const firstRefresh = refreshPromptOptions.call(harness);
		const secondRefresh = refreshPromptOptions.call(harness);
		first.complete({ kind: 'resolved', options: [option('feature', 'Implement a feature')] });

		assert.deepStrictEqual({
			results: await Promise.all([firstRefresh, secondRefresh]),
			firstCancelled: tokens[0].isCancellationRequested,
			states: states.map(state => state.kind === 'loading' ? 'loading' : state.options[0].id),
		}, {
			results: [false, true],
			firstCancelled: true,
			states: ['loading', 'loading', 'bug'],
		});
	});

	test('replaces a generated prompt immediately', () => {
		let value = 'old prompt';
		let placeholder: string | undefined;
		let position: { readonly lineNumber: number; readonly column: number } | undefined;
		const harness: IReplacePromptHarness = {
			_editor: {
				getModel: () => ({
					getValue: () => value,
					getFullModelRange: () => ({}),
					getLineCount: () => 1,
					getLineMaxColumn: () => value.length + 1,
				}),
				pushUndoStop: () => undefined,
				executeEdits: (_source, edits) => {
					value = edits[0].text;
					return true;
				},
				setPosition: nextPosition => position = nextPosition,
			},
			_promptTypingAnimation: { clear: () => undefined },
			_promptTemplatePlaceholder: { value: { setPlaceholder: nextPlaceholder => placeholder = nextPlaceholder } },
		};

		const replaced = replacePrompt.call(harness, 'new [task] prompt', '[task]', 'old prompt');

		assert.deepStrictEqual({ replaced, value, placeholder, position }, {
			replaced: true,
			value: 'new [task] prompt',
			placeholder: '[task]',
			position: { lineNumber: 1, column: 18 },
		});
	});

	test('clears loading when the current prompt option refresh is cancelled', async () => {
		const result = new DeferredPromise<NewSessionPromptOptionsState>();
		const source = disposables.add(new CancellationTokenSource());
		const states: (NewSessionPromptOptionsState | undefined)[] = [];
		const refresh = disposables.add(new MutableDisposable<CancellationTokenSource>());
		const harness: IPromptOptionsRefreshHarness = {
			_promptOptionsRefresh: refresh,
			_promptOptionsResolver: () => result.p,
			preparePromptOptionsRefresh: () => {
				refresh.value?.cancel();
				refresh.clear();
				states.push({ kind: 'loading' });
				return true;
			},
			showPromptOptions: state => {
				states.push(state);
				return true;
			},
		};

		const refreshing = refreshPromptOptions.call(harness, source.token);
		source.cancel();
		result.complete({ kind: 'resolved', options: [option('feature', 'Implement a feature')] });

		assert.deepStrictEqual({
			shown: await refreshing,
			states: states.map(state => state?.kind ?? 'hidden'),
		}, {
			shown: false,
			states: ['loading', 'hidden'],
		});
	});
});

function option(id: string, title: string): INewSessionPromptOption {
	return {
		id,
		title,
		description: `Description for ${title}`,
		prompt: `Prompt for ${title}: [${id}]`,
		placeholder: `[${id}]`,
	};
}

function snapshotButtons(buttons: readonly HTMLElement[]): object[] {
	return buttons.map(button => ({
		selected: button.getAttribute('aria-pressed') === 'true',
		disabled: button.getAttribute('aria-disabled') === 'true',
	}));
}
