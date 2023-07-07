/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { ITerminalAddon } from 'xterm-headless';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import * as dom from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { asArray } from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { DecorationSelector, updateLayout } from 'vs/workbench/contrib/terminal/browser/xterm/decorationStyles';
import type { IDecoration, Terminal } from 'xterm';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IActionWidgetService } from 'vs/platform/actionWidget/browser/actionWidget';
import { ActionSet } from 'vs/platform/actionWidget/common/actionWidget';
import { getLinesForCommand } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { ILabelService } from 'vs/platform/label/common/label';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ITerminalQuickFixInternalOptions, ITerminalQuickFixResolvedExtensionOptions, ITerminalQuickFix, ITerminalQuickFixCommandAction, ITerminalQuickFixOpenerAction, ITerminalQuickFixOptions, ITerminalQuickFixProviderSelector, ITerminalQuickFixService, ITerminalQuickFixUnresolvedExtensionOptions, TerminalQuickFixType } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFix';
import { ITerminalCommandSelector } from 'vs/platform/terminal/common/terminal';
import { ActionListItemKind, IActionListItem } from 'vs/platform/actionWidget/browser/actionList';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/common/types';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';

const quickFixSelectors = [
	DecorationSelector.QuickFix,
	DecorationSelector.LightBulb,
	DecorationSelector.Codicon,
	DecorationSelector.CommandDecoration,
	DecorationSelector.XtermDecoration
];

export interface ITerminalQuickFixAddon {
	showMenu(): void;
	onDidRequestRerunCommand: Event<{ command: string; addNewLine?: boolean }>;
	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression and provides a callback to be executed for commands that match.
	 */
	registerCommandFinishedListener(options: ITerminalQuickFixOptions): void;
}

export class TerminalQuickFixAddon extends Disposable implements ITerminalAddon, ITerminalQuickFixAddon {
	private readonly _onDidRequestRerunCommand = new Emitter<{ command: string; addNewLine?: boolean }>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;

	private _terminal: Terminal | undefined;

	private _commandListeners: Map<string, (ITerminalQuickFixOptions | ITerminalQuickFixResolvedExtensionOptions | ITerminalQuickFixUnresolvedExtensionOptions)[]> = new Map();

	private _quickFixes: ITerminalAction[] | undefined;

	private _decoration: IDecoration | undefined;

	private _currentRenderContext: { quickFixes: ITerminalAction[]; anchor: IAnchor; parentElement: HTMLElement } | undefined;

	private _lastQuickFixId: string | undefined;

	private _registeredSelectors: Set<string> = new Set();

	constructor(
		private readonly _aliases: string[][] | undefined,
		private readonly _capabilities: ITerminalCapabilityStore,
		@ITerminalQuickFixService private readonly _quickFixService: ITerminalQuickFixService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ILabelService private readonly _labelService: ILabelService
	) {
		super();
		const commandDetectionCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (commandDetectionCapability) {
			this._registerCommandHandlers();
		} else {
			this._register(this._capabilities.onDidAddCapability(c => {
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

		// TODO: What's documentation do? Need a vscode command?
		const actions = this._currentRenderContext.quickFixes.map(f => new TerminalQuickFixItem(f, f.type, f.source, f.label));
		const documentation = this._currentRenderContext.quickFixes.map(f => { return { id: f.source, title: f.label, tooltip: f.source }; });
		const actionSet = {
			// TODO: Documentation and actions are separate?
			documentation,
			allActions: actions,
			hasAutoFix: false,
			validActions: actions,
			dispose: () => { }
		} as ActionSet<TerminalQuickFixItem>;
		const delegate = {
			onSelect: async (fix: TerminalQuickFixItem) => {
				fix.action?.run();
				this._actionWidgetService.hide();
				this._disposeQuickFix(fix.action.id, true);
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
			commandExitResult: selector.commandExitResult
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
			this._disposeQuickFix(this._lastQuickFixId, false);
		}
		const resolver = async (selector: ITerminalQuickFixOptions, lines?: string[]) => {
			if (lines === undefined) {
				return undefined;
			}
			const id = selector.id;
			await this._extensionService.activateByEvent(`onTerminalQuickFixRequest:${id}`);
			return this._quickFixService.providers.get(id)?.provideTerminalQuickFixes(command, lines, { type: 'resolved', commandLineMatcher: selector.commandLineMatcher, outputMatcher: selector.outputMatcher, commandExitResult: selector.commandExitResult, id: selector.id }, new CancellationTokenSource().token);
		};
		const result = await getQuickFixesForCommand(aliases, terminal, command, this._commandListeners, this._openerService, this._labelService, this._onDidRequestRerunCommand, resolver);
		if (!result) {
			return;
		}

		this._quickFixes = result;
		this._lastQuickFixId = this._quickFixes[0].id;
		this._registerQuickFixDecoration();
	}

	private _disposeQuickFix(id: string, ranQuickFix: boolean): void {
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
			ranQuickFix
		});
		this._decoration?.dispose();
		this._decoration = undefined;
		this._quickFixes = undefined;
		this._lastQuickFixId = undefined;
	}

	/**
	 * Registers a decoration with the quick fixes
	 */
	private _registerQuickFixDecoration(): void {
		if (!this._terminal) {
			return;
		}
		if (!this._quickFixes) {
			return;
		}
		const marker = this._terminal.registerMarker();
		if (!marker) {
			return;
		}
		const decoration = this._terminal.registerDecoration({ marker, layer: 'top' });
		if (!decoration) {
			return;
		}
		this._decoration = decoration;
		const fixes = this._quickFixes;
		if (!fixes) {
			decoration.dispose();
			return;
		}
		decoration?.onRender((e: HTMLElement) => {
			if (e.classList.contains(DecorationSelector.QuickFix)) {
				return;
			}
			e.classList.add(...quickFixSelectors);
			updateLayout(this._configurationService, e);
			this._audioCueService.playAudioCue(AudioCue.terminalQuickFix);
			const rect = e.getBoundingClientRect();
			const anchor = {
				x: rect.x,
				y: rect.y,
				width: rect.width,
				height: rect.height
			};

			const parentElement = e.parentElement?.parentElement?.parentElement?.parentElement;
			if (!parentElement) {
				return;
			}

			this._currentRenderContext = { quickFixes: fixes, anchor, parentElement };
			this._register(dom.addDisposableListener(e, dom.EventType.CLICK, () => this.showMenu()));
		});
		decoration.onDispose(() => this._currentRenderContext = undefined);
		this._quickFixes = undefined;
	}
}

export interface ITerminalAction extends IAction {
	type: TerminalQuickFixType;
	source: string;
	uri?: URI;
	command?: string;
}

export async function getQuickFixesForCommand(
	aliases: string[][] | undefined,
	terminal: Terminal,
	terminalCommand: ITerminalCommand,
	quickFixOptions: Map<string, ITerminalQuickFixOptions[]>,
	openerService: IOpenerService,
	labelService: ILabelService,
	onDidRequestRerunCommand?: Emitter<{ command: string; addNewLine?: boolean }>,
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
							case TerminalQuickFixType.Command: {
								const fix = quickFix as ITerminalQuickFixCommandAction;
								if (commandQuickFixSet.has(fix.terminalCommand)) {
									continue;
								}
								commandQuickFixSet.add(fix.terminalCommand);
								const label = localize('quickFix.command', 'Run: {0}', fix.terminalCommand);
								action = {
									type: TerminalQuickFixType.Command,
									class: undefined,
									source: quickFix.source,
									id: quickFix.id,
									label,
									enabled: true,
									run: () => {
										onDidRequestRerunCommand?.fire({
											command: fix.terminalCommand,
											addNewLine: fix.addNewLine ?? true
										});
									},
									tooltip: label,
									command: fix.terminalCommand
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
		getQuickFixes: selectorProvider.provider.provideTerminalQuickFixes
	};
}

class TerminalQuickFixItem {
	action: ITerminalAction;
	type: TerminalQuickFixType;
	disabled?: boolean;
	title?: string;
	source: string;
	constructor(action: ITerminalAction, type: TerminalQuickFixType, source: string, title?: string, disabled?: boolean) {
		this.action = action;
		this.disabled = disabled;
		this.title = title;
		this.source = source;
		this.type = type;
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
	switch (quickFix.type) {
		case TerminalQuickFixType.Opener:
			if ('uri' in quickFix.action && quickFix.action.uri) {
				const isUrl = (quickFix.action.uri.scheme === Schemas.http || quickFix.action.uri.scheme === Schemas.https);
				return isUrl ? Codicon.linkExternal : Codicon.goToFile;
			}
		case TerminalQuickFixType.Command:
			return Codicon.run;
		case TerminalQuickFixType.Port:
			return Codicon.debugDisconnect;
	}
}
