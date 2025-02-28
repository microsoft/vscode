/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalAddon } from '@xterm/headless';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IAction } from '../../../../../base/common/actions.js';
import { asArray } from '../../../../../base/common/arrays.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { DecorationSelector, updateLayout } from '../../../terminal/browser/xterm/decorationStyles.js';
import type { IDecoration, Terminal } from '@xterm/xterm';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionSet } from '../../../../../platform/actionWidget/common/actionWidget.js';
import { getLinesForCommand } from '../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITerminalQuickFixInternalOptions, ITerminalQuickFixResolvedExtensionOptions, ITerminalQuickFix, ITerminalQuickFixTerminalCommandAction, ITerminalQuickFixOpenerAction, ITerminalQuickFixOptions, ITerminalQuickFixProviderSelector, ITerminalQuickFixService, ITerminalQuickFixUnresolvedExtensionOptions, TerminalQuickFixType, ITerminalQuickFixCommandAction } from './quickFix.js';
import { ITerminalCommandSelector } from '../../../../../platform/terminal/common/terminal.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { CodeActionKind } from '../../../../../editor/contrib/codeAction/common/types.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';

const enum QuickFixDecorationSelector {
	QuickFix = 'quick-fix'
}

const quickFixClasses = [
	QuickFixDecorationSelector.QuickFix,
	DecorationSelector.Codicon,
	DecorationSelector.CommandDecoration,
	DecorationSelector.XtermDecoration
];

export interface ITerminalQuickFixAddon {
	readonly onDidRequestRerunCommand: Event<{ command: string; shouldExecute?: boolean }>;
	readonly onDidUpdateQuickFixes: Event<{ command: ITerminalCommand; actions: ITerminalAction[] | undefined }>;
	showMenu(): void;
	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression and provides a callback to be executed for commands that match.
	 */
	registerCommandFinishedListener(options: ITerminalQuickFixOptions): void;
}

export class TerminalQuickFixAddon extends Disposable implements ITerminalAddon, ITerminalQuickFixAddon {

	private _terminal: Terminal | undefined;

	private _commandListeners: Map<string, (ITerminalQuickFixOptions | ITerminalQuickFixResolvedExtensionOptions | ITerminalQuickFixUnresolvedExtensionOptions)[]> = new Map();

	private _quickFixes: ITerminalAction[] | undefined;

	private readonly _decoration: MutableDisposable<IDecoration> = this._register(new MutableDisposable());
	private readonly _decorationDisposables: MutableDisposable<IDisposable> = this._register(new MutableDisposable());

	private _currentRenderContext: { quickFixes: ITerminalAction[]; anchor: IAnchor; parentElement: HTMLElement } | undefined;

	private _lastQuickFixId: string | undefined;

	private readonly _registeredSelectors: Set<string> = new Set();

	private _didRun: boolean = false;

	private readonly _onDidRequestRerunCommand = new Emitter<{ command: string; shouldExecute?: boolean }>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;
	private readonly _onDidUpdateQuickFixes = new Emitter<{ command: ITerminalCommand; actions: ITerminalAction[] | undefined }>();
	readonly onDidUpdateQuickFixes = this._onDidUpdateQuickFixes.event;

	constructor(
		private readonly _aliases: string[][] | undefined,
		private readonly _capabilities: ITerminalCapabilityStore,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILabelService private readonly _labelService: ILabelService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITerminalQuickFixService private readonly _quickFixService: ITerminalQuickFixService,
	) {
		super();
		const commandDetectionCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (commandDetectionCapability) {
			this._registerCommandHandlers();
		} else {
			this._register(this._capabilities.onDidAddCapabilityType(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._registerCommandHandlers();
				}
			}));
		}
		this._register(this._quickFixService.onDidRegisterProvider(result => this.registerCommandFinishedListener(convertToQuickFixOptions(result))));
		this._quickFixService.extensionQuickFixes.then(quickFixSelectors => {
			for (const selector of quickFixSelectors) {
				this.registerCommandSelector(selector);
			}
		});
		this._register(this._quickFixService.onDidRegisterCommandSelector(selector => this.registerCommandSelector(selector)));
		this._register(this._quickFixService.onDidUnregisterProvider(id => this._commandListeners.delete(id)));
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	showMenu(): void {
		if (!this._currentRenderContext) {
			return;
		}

		const actions = this._currentRenderContext.quickFixes.map(f => new TerminalQuickFixItem(f, f.type, f.source, f.label, f.kind));
		const actionSet = {
			allActions: actions,
			hasAutoFix: false,
			hasAIFix: false,
			allAIFixes: false,
			validActions: actions,
			dispose: () => { }
		} satisfies ActionSet<TerminalQuickFixItem>;
		const delegate = {
			onSelect: async (fix: TerminalQuickFixItem) => {
				fix.action?.run();
				this._actionWidgetService.hide();
			},
			onHide: () => {
				this._terminal?.focus();
			},
		};
		this._actionWidgetService.show('quickFixWidget', false, toActionWidgetItems(actionSet.validActions, true), delegate, this._currentRenderContext.anchor, this._currentRenderContext.parentElement);
	}

	registerCommandSelector(selector: ITerminalCommandSelector): void {
		if (this._registeredSelectors.has(selector.id)) {
			return;
		}
		const matcherKey = selector.commandLineMatcher.toString();
		const currentOptions = this._commandListeners.get(matcherKey) || [];
		currentOptions.push({
			id: selector.id,
			type: 'unresolved',
			commandLineMatcher: selector.commandLineMatcher,
			outputMatcher: selector.outputMatcher,
			commandExitResult: selector.commandExitResult,
			kind: selector.kind
		});
		this._registeredSelectors.add(selector.id);
		this._commandListeners.set(matcherKey, currentOptions);
	}

	registerCommandFinishedListener(options: ITerminalQuickFixOptions | ITerminalQuickFixResolvedExtensionOptions): void {
		const matcherKey = options.commandLineMatcher.toString();
		let currentOptions = this._commandListeners.get(matcherKey) || [];
		// removes the unresolved options
		currentOptions = currentOptions.filter(o => o.id !== options.id);
		currentOptions.push(options);
		this._commandListeners.set(matcherKey, currentOptions);
	}

	private _registerCommandHandlers(): void {
		const terminal = this._terminal;
		const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!terminal || !commandDetection) {
			return;
		}
		this._register(commandDetection.onCommandFinished(async command => await this._resolveQuickFixes(command, this._aliases)));
	}

	/**
	 * Resolves quick fixes, if any, based on the
	 * @param command & its output
	 */
	private async _resolveQuickFixes(command: ITerminalCommand, aliases?: string[][]): Promise<void> {
		const terminal = this._terminal;
		if (!terminal || command.wasReplayed) {
			return;
		}
		if (command.command !== '' && this._lastQuickFixId) {
			this._disposeQuickFix(command, this._lastQuickFixId);
		}

		const resolver = async (selector: ITerminalQuickFixOptions, lines?: string[]) => {
			if (lines === undefined) {
				return undefined;
			}
			const id = selector.id;
			await this._extensionService.activateByEvent(`onTerminalQuickFixRequest:${id}`);
			return this._quickFixService.providers.get(id)?.provideTerminalQuickFixes(command, lines, {
				type: 'resolved',
				commandLineMatcher: selector.commandLineMatcher,
				outputMatcher: selector.outputMatcher,
				commandExitResult: selector.commandExitResult,
				kind: selector.kind,
				id: selector.id
			}, new CancellationTokenSource().token);
		};
		const result = await getQuickFixesForCommand(aliases, terminal, command, this._commandListeners, this._commandService, this._openerService, this._labelService, this._onDidRequestRerunCommand, resolver);
		if (!result) {
			return;
		}

		this._quickFixes = result;
		this._lastQuickFixId = this._quickFixes[0].id;
		this._registerQuickFixDecoration();
		this._onDidUpdateQuickFixes.fire({ command, actions: this._quickFixes });
		this._quickFixes = undefined;
	}

	private _disposeQuickFix(command: ITerminalCommand, id: string): void {
		type QuickFixResultTelemetryEvent = {
			quickFixId: string;
			ranQuickFix: boolean;
		};
		type QuickFixClassification = {
			owner: 'meganrogge';
			quickFixId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The quick fix ID' };
			ranQuickFix: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the quick fix was run' };
			comment: 'Terminal quick fixes';
		};
		this._telemetryService?.publicLog2<QuickFixResultTelemetryEvent, QuickFixClassification>('terminal/quick-fix', {
			quickFixId: id,
			ranQuickFix: this._didRun
		});
		this._decoration.clear();
		this._decorationDisposables.clear();
		this._onDidUpdateQuickFixes.fire({ command, actions: this._quickFixes });
		this._quickFixes = undefined;
		this._lastQuickFixId = undefined;
		this._didRun = false;
	}

	/**
	 * Registers a decoration with the quick fixes
	 */
	private _registerQuickFixDecoration(): void {
		if (!this._terminal) {
			return;
		}

		this._decoration.clear();
		this._decorationDisposables.clear();
		const quickFixes = this._quickFixes;
		if (!quickFixes || quickFixes.length === 0) {
			return;
		}
		const marker = this._terminal.registerMarker();
		if (!marker) {
			return;
		}
		const decoration = this._decoration.value = this._terminal.registerDecoration({ marker, width: 2, layer: 'top' });
		if (!decoration) {
			return;
		}
		const store = this._decorationDisposables.value = new DisposableStore();
		store.add(decoration.onRender(e => {
			const rect = e.getBoundingClientRect();
			const anchor = {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height
			};

			if (e.classList.contains(QuickFixDecorationSelector.QuickFix)) {
				if (this._currentRenderContext) {
					this._currentRenderContext.anchor = anchor;
				}

				return;
			}

			e.classList.add(...quickFixClasses);
			const isExplainOnly = quickFixes.every(e => e.kind === 'explain');
			if (isExplainOnly) {
				e.classList.add('explainOnly');
			}
			e.classList.add(...ThemeIcon.asClassNameArray(isExplainOnly ? Codicon.sparkle : Codicon.lightBulb));

			updateLayout(this._configurationService, e);
			this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalQuickFix);

			const parentElement = e.closest('.xterm')?.parentElement;
			if (!parentElement) {
				return;
			}

			this._currentRenderContext = { quickFixes, anchor, parentElement };
			this._register(dom.addDisposableListener(e, dom.EventType.CLICK, () => this.showMenu()));
		}));
		store.add(decoration.onDispose(() => this._currentRenderContext = undefined));
	}
}

export interface ITerminalAction extends IAction {
	type: TerminalQuickFixType;
	kind?: 'fix' | 'explain';
	source: string;
	uri?: URI;
	command?: string;
	shouldExecute?: boolean;
}

export async function getQuickFixesForCommand(
	aliases: string[][] | undefined,
	terminal: Terminal,
	terminalCommand: ITerminalCommand,
	quickFixOptions: Map<string, ITerminalQuickFixOptions[]>,
	commandService: ICommandService,
	openerService: IOpenerService,
	labelService: ILabelService,
	onDidRequestRerunCommand?: Emitter<{ command: string; shouldExecute?: boolean }>,
	getResolvedFixes?: (selector: ITerminalQuickFixOptions, lines?: string[]) => Promise<ITerminalQuickFix | ITerminalQuickFix[] | undefined>
): Promise<ITerminalAction[] | undefined> {
	// Prevent duplicates by tracking added entries
	const commandQuickFixSet: Set<string> = new Set();
	const openQuickFixSet: Set<string> = new Set();

	const fixes: ITerminalAction[] = [];
	const newCommand = terminalCommand.command;
	for (const options of quickFixOptions.values()) {
		for (const option of options) {
			if ((option.commandExitResult === 'success' && terminalCommand.exitCode !== 0) || (option.commandExitResult === 'error' && terminalCommand.exitCode === 0)) {
				continue;
			}
			let quickFixes;
			if (option.type === 'resolved') {
				quickFixes = await (option as ITerminalQuickFixResolvedExtensionOptions).getQuickFixes(terminalCommand, getLinesForCommand(terminal.buffer.active, terminalCommand, terminal.cols, option.outputMatcher), option, new CancellationTokenSource().token);
			} else if (option.type === 'unresolved') {
				if (!getResolvedFixes) {
					throw new Error('No resolved fix provider');
				}
				quickFixes = await getResolvedFixes(option, option.outputMatcher ? getLinesForCommand(terminal.buffer.active, terminalCommand, terminal.cols, option.outputMatcher) : undefined);
			} else if (option.type === 'internal') {
				const commandLineMatch = newCommand.match(option.commandLineMatcher);
				if (!commandLineMatch) {
					continue;
				}
				const outputMatcher = option.outputMatcher;
				let outputMatch;
				if (outputMatcher) {
					outputMatch = terminalCommand.getOutputMatch(outputMatcher);
				}
				if (!outputMatch) {
					continue;
				}
				const matchResult = { commandLineMatch, outputMatch, commandLine: terminalCommand.command };
				quickFixes = (option as ITerminalQuickFixInternalOptions).getQuickFixes(matchResult);
			}

			if (quickFixes) {
				for (const quickFix of asArray(quickFixes)) {
					let action: ITerminalAction | undefined;
					if ('type' in quickFix) {
						switch (quickFix.type) {
							case TerminalQuickFixType.TerminalCommand: {
								const fix = quickFix as ITerminalQuickFixTerminalCommandAction;
								if (commandQuickFixSet.has(fix.terminalCommand)) {
									continue;
								}
								commandQuickFixSet.add(fix.terminalCommand);
								const label = localize('quickFix.command', 'Run: {0}', fix.terminalCommand);
								action = {
									type: TerminalQuickFixType.TerminalCommand,
									kind: option.kind,
									class: undefined,
									source: quickFix.source,
									id: quickFix.id,
									label,
									enabled: true,
									run: () => {
										onDidRequestRerunCommand?.fire({
											command: fix.terminalCommand,
											shouldExecute: fix.shouldExecute ?? true
										});
									},
									tooltip: label,
									command: fix.terminalCommand,
									shouldExecute: fix.shouldExecute
								};
								break;
							}
							case TerminalQuickFixType.Opener: {
								const fix = quickFix as ITerminalQuickFixOpenerAction;
								if (!fix.uri) {
									return;
								}
								if (openQuickFixSet.has(fix.uri.toString())) {
									continue;
								}
								openQuickFixSet.add(fix.uri.toString());
								const isUrl = (fix.uri.scheme === Schemas.http || fix.uri.scheme === Schemas.https);
								const uriLabel = isUrl ? encodeURI(fix.uri.toString(true)) : labelService.getUriLabel(fix.uri);
								const label = localize('quickFix.opener', 'Open: {0}', uriLabel);
								action = {
									source: quickFix.source,
									id: quickFix.id,
									label,
									type: TerminalQuickFixType.Opener,
									kind: option.kind,
									class: undefined,
									enabled: true,
									run: () => openerService.open(fix.uri),
									tooltip: label,
									uri: fix.uri
								};
								break;
							}
							case TerminalQuickFixType.Port: {
								const fix = quickFix as ITerminalAction;
								action = {
									source: 'builtin',
									type: fix.type,
									kind: option.kind,
									id: fix.id,
									label: fix.label,
									class: fix.class,
									enabled: fix.enabled,
									run: () => {
										fix.run();
									},
									tooltip: fix.tooltip
								};
								break;
							}
							case TerminalQuickFixType.VscodeCommand: {
								const fix = quickFix as ITerminalQuickFixCommandAction;
								action = {
									source: quickFix.source,
									type: fix.type,
									kind: option.kind,
									id: fix.id,
									label: fix.title,
									class: undefined,
									enabled: true,
									run: () => commandService.executeCommand(fix.id),
									tooltip: fix.title
								};
								break;
							}
						}
						if (action) {
							fixes.push(action);
						}
					}
				}
			}
		}
	}
	return fixes.length > 0 ? fixes : undefined;
}

function convertToQuickFixOptions(selectorProvider: ITerminalQuickFixProviderSelector): ITerminalQuickFixResolvedExtensionOptions {
	return {
		id: selectorProvider.selector.id,
		type: 'resolved',
		commandLineMatcher: selectorProvider.selector.commandLineMatcher,
		outputMatcher: selectorProvider.selector.outputMatcher,
		commandExitResult: selectorProvider.selector.commandExitResult,
		kind: selectorProvider.selector.kind,
		getQuickFixes: selectorProvider.provider.provideTerminalQuickFixes
	};
}

class TerminalQuickFixItem {
	readonly disabled = false;
	constructor(
		readonly action: ITerminalAction,
		readonly type: TerminalQuickFixType,
		readonly source: string,
		readonly title: string | undefined,
		readonly kind: 'fix' | 'explain' = 'fix'
	) {
	}
}

function toActionWidgetItems(inputQuickFixes: readonly TerminalQuickFixItem[], showHeaders: boolean): IActionListItem<TerminalQuickFixItem>[] {
	const menuItems: IActionListItem<TerminalQuickFixItem>[] = [];
	menuItems.push({
		kind: ActionListItemKind.Header,
		group: {
			kind: CodeActionKind.QuickFix,
			title: localize('codeAction.widget.id.quickfix', 'Quick Fix')
		}
	});
	for (const quickFix of showHeaders ? inputQuickFixes : inputQuickFixes.filter(i => !!i.action)) {
		if (!quickFix.disabled && quickFix.action) {
			menuItems.push({
				kind: ActionListItemKind.Action,
				item: quickFix,
				group: {
					kind: CodeActionKind.QuickFix,
					icon: getQuickFixIcon(quickFix),
					title: quickFix.action.label
				},
				disabled: false,
				label: quickFix.title
			});
		}
	}
	return menuItems;
}

function getQuickFixIcon(quickFix: TerminalQuickFixItem): ThemeIcon {
	if (quickFix.kind === 'explain') {
		return Codicon.sparkle;
	}
	switch (quickFix.type) {
		case TerminalQuickFixType.Opener:
			if ('uri' in quickFix.action && quickFix.action.uri) {
				const isUrl = (quickFix.action.uri.scheme === Schemas.http || quickFix.action.uri.scheme === Schemas.https);
				return isUrl ? Codicon.linkExternal : Codicon.goToFile;
			}
		case TerminalQuickFixType.TerminalCommand:
			return Codicon.run;
		case TerminalQuickFixType.Port:
			return Codicon.debugDisconnect;
		case TerminalQuickFixType.VscodeCommand:
			return Codicon.lightbulb;
	}
}
