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
import { INewSessionPromptOption, INewSessionPromptOptionsController, NewSessionPromptOptionsState } from '../../browser/newSessionComposerService.js';
import { NewSessionPromptOptionsWidget } from '../../browser/newSessionPromptOptions.js';

interface IPromptOptionsRefreshHarness {
	readonly _promptOptionsRefresh: MutableDisposable<CancellationTokenSource>;
	readonly _promptOptionsController: INewSessionPromptOptionsController;
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

	test('renders loading, preserves disabled selection, and clears selection for empty input', async () => {
		const container = document.createElement('div');
		const hoverService = new TestHoverService();
		const selections: { readonly optionId: string; readonly expectedInput: string; readonly animate: boolean }[] = [];
		const selectedOptionIds: string[] = [];
		let inputValue = '';
		const widget = disposables.add(new NewSessionPromptOptionsWidget(container, {
			selectOption: async (option, expectedInput, animate) => {
				selections.push({ optionId: option.id, expectedInput, animate });
				inputValue = option.prompt;
				widget.setInputValue(inputValue);
				return true;
			},
			onDidSelectOption: option => selectedOptionIds.push(option.id),
			onDidClose: () => undefined,
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
			selectedOptionIds,
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
			selectedOptionIds: ['feature', 'bug'],
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
				{ selected: false, disabled: false },
			],
		});
	});

	test('renders repository content and action separately while preserving full accessible text', () => {
		const container = document.createElement('div');
		const hoverService = new TestHoverService();
		const widget = disposables.add(new NewSessionPromptOptionsWidget(container, {
			selectOption: async () => true,
			onDidSelectOption: () => undefined,
			onDidClose: () => undefined,
		}, hoverService));
		const gitHubOption: INewSessionPromptOption = {
			...option('issue', 'Tackle issue'),
			titleDetail: '#123',
			description: 'A complete issue title',
		};

		widget.setState({ kind: 'resolved', options: [gitHubOption] });
		const button = widget.element.querySelector<HTMLElement>('.new-session-prompt-option');

		assert.deepStrictEqual({
			hasTitleDetailClass: button?.classList.contains('has-title-detail'),
			description: button?.querySelector('.new-session-prompt-option-description')?.textContent,
			title: button?.querySelector('.new-session-prompt-option-title-label')?.textContent,
			detail: button?.querySelector('.new-session-prompt-option-title-detail')?.textContent,
			actionIconAriaHidden: button?.querySelector('.new-session-prompt-option-action-icon')?.getAttribute('aria-hidden'),
			ariaLabel: button?.getAttribute('aria-label'),
			hover: hoverService.contents,
		}, {
			hasTitleDetailClass: true,
			description: 'A complete issue title',
			title: 'Tackle issue',
			detail: '#123',
			actionIconAriaHidden: 'true',
			ariaLabel: 'Tackle issue #123: A complete issue title',
			hover: ['**Tackle issue \\#123**\n\nA complete issue title'],
		});
	});

	test('renders a close action in the title row', async () => {
		const container = document.createElement('div');
		const hoverService = new TestHoverService();
		let closeCount = 0;
		const widget = disposables.add(new NewSessionPromptOptionsWidget(container, {
			selectOption: async () => true,
			onDidSelectOption: () => undefined,
			onDidClose: () => {
				closeCount++;
				widget.setState(undefined);
			},
		}, hoverService));
		widget.setState({ kind: 'resolved', options: [option('feature', 'Implement a feature')] });

		const closeAction = widget.element.querySelector<HTMLElement>('.new-session-prompt-options-actions .action-label');
		closeAction?.click();
		await timeout(0);

		assert.deepStrictEqual({
			closeCount,
			label: closeAction?.getAttribute('aria-label'),
			titleRow: closeAction?.closest('.new-session-prompt-options-header') !== null,
			hidden: widget.element.style.display === 'none',
		}, {
			closeCount: 1,
			label: 'Close',
			titleRow: true,
			hidden: true,
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
			_promptOptionsController: {
				resolve: token => {
					tokens.push(token);
					requestCount++;
					return requestCount === 1 ? first.p : Promise.resolve({ kind: 'resolved', options: [option('bug', 'Fix a bug')] });
				},
				onDidSelectOption: () => undefined,
				onDidClose: () => undefined,
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
			_promptOptionsController: {
				resolve: () => result.p,
				onDidSelectOption: () => undefined,
				onDidClose: () => undefined,
			},
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

	test('does not resolve prompt options after dismissal', async () => {
		let resolveCount = 0;
		const harness: IPromptOptionsRefreshHarness = {
			_promptOptionsRefresh: disposables.add(new MutableDisposable<CancellationTokenSource>()),
			_promptOptionsController: {
				resolve: async () => {
					resolveCount++;
					return { kind: 'resolved', options: [] };
				},
				onDidSelectOption: () => undefined,
				onDidClose: () => undefined,
			},
			preparePromptOptionsRefresh: () => false,
			showPromptOptions: () => true,
		};

		assert.deepStrictEqual({
			shown: await refreshPromptOptions.call(harness),
			resolveCount,
		}, {
			shown: false,
			resolveCount: 0,
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
