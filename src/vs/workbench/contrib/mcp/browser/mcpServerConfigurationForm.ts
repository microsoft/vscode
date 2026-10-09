/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mcpServerConfigurationForm.css';
import * as DOM from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IMcpServerConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { defaultButtonStyles, getInputBoxStyle } from '../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { settingsTextInputBorder } from '../../preferences/common/settingsEditorColorRegistry.js';
import { McpResourceFormat } from '../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { IEditableMcpServerConfiguration } from '../common/mcpTypes.js';
import { getMcpServerFormatError, getMcpServerFormCapabilities, IMcpServerFormCapabilities, IMcpServerFormKeyValue, IMcpServerFormState, IMcpServerFormValidation, isMcpServerFormValid, McpServerFormKind, toMcpServerConfiguration, toMcpServerFormState, validateMcpServerFormState } from '../common/mcpServerConfigurationForm.js';

const $ = DOM.$;

/** Whether focus is inside an {@link McpServerConfigurationForm}. */
export const McpServerConfigurationFormFocusContext = new RawContextKey<boolean>('mcpServerConfigurationFormFocus', false, localize('mcpServerConfigurationFormFocus', "Whether focus is in an MCP server configuration form"));

export interface IMcpServerConfigurationFormOptions {
	/** Opens the configuration file at the server's entry, to edit properties the form does not show. */
	readonly openConfiguration: () => void;
}

/**
 * A server configuration shown in {@link McpServerConfigurationForm}, together with how to save it.
 */
export interface IMcpServerConfigurationFormInput extends IEditableMcpServerConfiguration {
	/** Identifies the server; unsaved edits are kept while the same server is shown. */
	readonly id: string;
	/** Name of the server in its configuration file. */
	readonly name: string;
	readonly label: string;
}

// Match the Settings and Profiles editors, whose inputs stay visible on themes with a faint `input.border`.
const formInputBoxStyles = getInputBoxStyle({ inputBorder: settingsTextInputBorder });

interface IKeyValueListLabels {
	readonly namePlaceholder: string;
	readonly valuePlaceholder: string;
	readonly nameAriaLabel: (index: number) => string;
	readonly valueAriaLabel: (name: string, index: number) => string;
	readonly removeAriaLabel: (name: string, index: number) => string;
	readonly addLabel: string;
}

/**
 * Editable list of name/value rows, used for environment variables and HTTP headers.
 */
class KeyValueList extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when a value changes. */
	readonly onDidChange = this._onDidChange.event;

	private readonly _onDidChangeRows = this._register(new Emitter<void>());
	/** Fires when rows are added or removed, which changes the list's height. */
	readonly onDidChangeRows = this._onDidChangeRows.event;

	private readonly rowsEl: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly errorEl: HTMLElement;
	private readonly addButton: Button;
	private readonly rowDisposables = this._register(new DisposableStore());
	private nameInputs: InputBox[] = [];
	private entries: IMcpServerFormKeyValue[] = [];

	constructor(
		parent: HTMLElement,
		private readonly labels: IKeyValueListLabels,
		private readonly contextViewService: IContextViewService,
	) {
		super();
		this.headerEl = DOM.append(parent, $('.mcp-config-form-kv-header'));
		DOM.append(this.headerEl, $('span', undefined, localize('mcpForm.kv.name', "Name")));
		DOM.append(this.headerEl, $('span', undefined, localize('mcpForm.kv.value', "Value")));
		this.rowsEl = DOM.append(parent, $('.mcp-config-form-kv-rows'));
		this.errorEl = DOM.append(parent, $('.mcp-config-form-error'));
		this.errorEl.setAttribute('aria-live', 'polite');
		this.addButton = this._register(new Button(DOM.append(parent, $('.mcp-config-form-kv-add')), {
			...defaultButtonStyles,
			secondary: true,
			small: true,
		}));
		this.addButton.label = labels.addLabel;
		this._register(this.addButton.onDidClick(() => {
			this.entries.push({ name: '', value: '' });
			this.renderRows();
			this.nameInputs.at(-1)?.focus();
			this._onDidChange.fire();
		}));
	}

	get value(): IMcpServerFormKeyValue[] {
		return this.entries;
	}

	set value(entries: IMcpServerFormKeyValue[]) {
		this.entries = entries;
		this.renderRows();
	}

	setError(message: string | undefined): void {
		this.errorEl.textContent = message ?? '';
		this.errorEl.style.display = message ? '' : 'none';
	}

	private renderRows(): void {
		this.rowDisposables.clear();
		DOM.clearNode(this.rowsEl);
		this.nameInputs = [];
		this.headerEl.style.display = this.entries.length ? '' : 'none';

		this.entries.forEach((entry, index) => {
			const row = DOM.append(this.rowsEl, $('.mcp-config-form-kv-row'));
			const nameInput = this.rowDisposables.add(new InputBox(DOM.append(row, $('.mcp-config-form-kv-name')), this.contextViewService, {
				placeholder: this.labels.namePlaceholder,
				ariaLabel: this.labels.nameAriaLabel(index + 1),
				inputBoxStyles: formInputBoxStyles,
			}));
			nameInput.value = entry.name;
			this.nameInputs.push(nameInput);

			const valueInput = this.rowDisposables.add(new InputBox(DOM.append(row, $('.mcp-config-form-kv-value')), this.contextViewService, {
				placeholder: this.labels.valuePlaceholder,
				ariaLabel: this.labels.valueAriaLabel(entry.name, index + 1),
				inputBoxStyles: formInputBoxStyles,
			}));
			valueInput.value = entry.value;

			const removeAction = this.rowDisposables.add(new Action('mcpForm.removeEntry', this.labels.removeAriaLabel(entry.name, index + 1), ThemeIcon.asClassName(Codicon.close), true, () => this.removeEntry(index)));
			const actionBar = this.rowDisposables.add(new ActionBar(DOM.append(row, $('.mcp-config-form-kv-actions'))));
			actionBar.push(removeAction, { icon: true, label: false });

			this.rowDisposables.add(nameInput.onDidChange(name => {
				entry.name = name;
				valueInput.setAriaLabel(this.labels.valueAriaLabel(name, index + 1));
				removeAction.label = this.labels.removeAriaLabel(name, index + 1);
				this._onDidChange.fire();
			}));
			this.rowDisposables.add(valueInput.onDidChange(value => {
				entry.value = value;
				this._onDidChange.fire();
			}));
		});

		this._onDidChangeRows.fire();
	}

	private removeEntry(index: number): void {
		this.entries.splice(index, 1);
		this.renderRows();
		// Keep keyboard focus in the list after the focused row disappears.
		const next = this.nameInputs[Math.min(index, this.nameInputs.length - 1)];
		if (next) {
			next.focus();
		} else {
			this.addButton.focus();
		}
		this._onDidChange.fire();
	}
}

/**
 * Form for editing the configuration of an installed MCP server: its type,
 * launch command or URL, environment variables and headers. Saving writes the
 * configuration back to the file the server was loaded from.
 */
export class McpServerConfigurationForm extends Disposable {

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	/** Fires when the form's height may have changed. */
	readonly onDidChangeContent = this._onDidChangeContent.event;

	readonly element: HTMLElement;

	private readonly kindRadio: Radio;
	private readonly envHint: HTMLElement;
	private readonly envFileField: HTMLElement;
	private readonly cwdField: HTMLElement;
	private readonly formatErrorEl: HTMLElement;
	private readonly stdioSection: HTMLElement;
	private readonly remoteSection: HTMLElement;
	private readonly commandInput: InputBox;
	private readonly argsInput: InputBox;
	private readonly envList: KeyValueList;
	private readonly envFileInput: InputBox;
	private readonly cwdInput: InputBox;
	private readonly urlInput: InputBox;
	private readonly headersList: KeyValueList;
	private readonly discardButton: Button;
	private readonly saveButton: Button;

	private input: IMcpServerConfigurationFormInput | undefined;
	private capabilities: IMcpServerFormCapabilities = getMcpServerFormCapabilities(McpResourceFormat.Vscode);
	private kinds: readonly McpServerFormKind[] = [];
	private baseline: IMcpServerConfiguration | undefined;
	private initialState: IMcpServerFormState | undefined;
	private state: IMcpServerFormState | undefined;
	private validation: IMcpServerFormValidation = {};
	private saving = false;

	constructor(
		parent: HTMLElement,
		options: IMcpServerConfigurationFormOptions,
		@INotificationService private readonly notificationService: INotificationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();

		this.element = DOM.append(parent, $('.mcp-config-form', { role: 'group' }));
		this.updateAriaLabel();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AccessibilityVerbositySettingId.McpServerConfiguration)) {
				this.updateAriaLabel();
			}
		}));
		this._register(this.keybindingService.onDidUpdateKeybindings(() => this.updateAriaLabel()));
		const focusContext = McpServerConfigurationFormFocusContext.bindTo(contextKeyService);
		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => focusContext.set(true)));
		this._register(focusTracker.onDidBlur(() => focusContext.reset()));
		this._register(toDisposable(() => focusContext.reset()));

		const typeField = this.appendField(this.element, localize('mcpForm.type', "Server Type"));
		this.kindRadio = this._register(new Radio({
			className: 'segmented',
			ariaLabel: localize('mcpForm.type.aria', "Server type"),
			items: [],
		}));
		typeField.appendChild(this.kindRadio.domNode);
		this._register(this.kindRadio.onDidSelect(index => {
			if (this.state) {
				this.state.kind = this.kinds[index];
				this.updateSections();
				this.onDidChangeState();
			}
		}));

		// stdio fields
		this.stdioSection = DOM.append(this.element, $('.mcp-config-form-section'));
		this.commandInput = this.appendInput(
			this.appendField(this.stdioSection, localize('mcpForm.command', "Command")),
			{ placeholder: 'npx', ariaLabel: localize('mcpForm.command.aria', "Command") },
			() => this.validation.command,
			value => this.state && (this.state.command = value),
		);
		const argsField = this.appendField(this.stdioSection, localize('mcpForm.args', "Arguments"), true);
		this.argsInput = this.appendInput(
			argsField,
			{ placeholder: '-y @modelcontextprotocol/server-filesystem /tmp', ariaLabel: localize('mcpForm.args.aria', "Arguments") },
			() => this.validation.args,
			value => this.state && (this.state.args = value),
		);
		this.appendHint(argsField, localize('mcpForm.args.hint', "Separate arguments with spaces, or enter a JSON array if an argument contains spaces or is empty."));

		const envField = this.appendField(this.stdioSection, localize('mcpForm.env', "Environment Variables"), true);
		this.envHint = this.appendHint(envField, '');
		this.envList = this._register(new KeyValueList(envField, {
			namePlaceholder: 'API_KEY',
			valuePlaceholder: localize('mcpForm.env.valuePlaceholder', "your-api-key"),
			nameAriaLabel: index => localize('mcpForm.env.nameAria', "Environment variable {0} name", index),
			valueAriaLabel: (name, index) => name
				? localize('mcpForm.env.valueAria', "Value of environment variable {0}", name)
				: localize('mcpForm.env.valueAriaIndex', "Environment variable {0} value", index),
			removeAriaLabel: (name, index) => name
				? localize('mcpForm.env.removeAria', "Remove environment variable {0}", name)
				: localize('mcpForm.env.removeAriaIndex', "Remove environment variable {0}", index),
			addLabel: localize('mcpForm.env.add', "Add Variable"),
		}, this.contextViewService));
		this.registerKeyValueList(this.envList, entries => this.state && (this.state.env = entries));

		this.envFileField = this.appendField(this.stdioSection, localize('mcpForm.envFile', "Environment File"), true);
		this.envFileInput = this.appendInput(
			this.envFileField,
			{ placeholder: '${workspaceFolder}/.env', ariaLabel: localize('mcpForm.envFile.aria', "Environment file") },
			() => undefined,
			value => this.state && (this.state.envFile = value),
		);
		this.cwdField = this.appendField(this.stdioSection, localize('mcpForm.cwd', "Working Directory"), true);
		this.cwdInput = this.appendInput(
			this.cwdField,
			{ placeholder: '${workspaceFolder}', ariaLabel: localize('mcpForm.cwd.aria', "Working directory") },
			() => undefined,
			value => this.state && (this.state.cwd = value),
		);

		// Remote (HTTP / SSE) fields
		this.remoteSection = DOM.append(this.element, $('.mcp-config-form-section'));
		this.urlInput = this.appendInput(
			this.appendField(this.remoteSection, localize('mcpForm.url', "URL")),
			{ placeholder: 'https://example.com/mcp', ariaLabel: localize('mcpForm.url.aria', "Server URL") },
			() => this.validation.url,
			value => this.state && (this.state.url = value),
		);
		const headersField = this.appendField(this.remoteSection, localize('mcpForm.headers', "Headers"), true);
		this.headersList = this._register(new KeyValueList(headersField, {
			namePlaceholder: 'Authorization',
			valuePlaceholder: 'Bearer ${input:token}',
			nameAriaLabel: index => localize('mcpForm.headers.nameAria', "Header {0} name", index),
			valueAriaLabel: (name, index) => name
				? localize('mcpForm.headers.valueAria', "Value of header {0}", name)
				: localize('mcpForm.headers.valueAriaIndex', "Header {0} value", index),
			removeAriaLabel: (name, index) => name
				? localize('mcpForm.headers.removeAria', "Remove header {0}", name)
				: localize('mcpForm.headers.removeAriaIndex', "Remove header {0}", index),
			addLabel: localize('mcpForm.headers.add', "Add Header"),
		}, this.contextViewService));
		this.registerKeyValueList(this.headersList, entries => this.state && (this.state.headers = entries));

		this.formatErrorEl = DOM.append(this.element, $('.mcp-config-form-error'));
		this.formatErrorEl.setAttribute('aria-live', 'polite');

		const footer = DOM.append(this.element, $('.mcp-config-form-footer'));
		const otherPropertiesButton = this._register(new Button(footer, {
			...defaultButtonStyles,
			secondary: true,
			title: localize('mcpForm.otherProperties.tooltip', "Open the configuration file to edit properties not shown here"),
		}));
		otherPropertiesButton.label = localize('mcpForm.otherProperties', "Other Properties");
		otherPropertiesButton.element.classList.add('mcp-config-form-other-properties');
		this._register(otherPropertiesButton.onDidClick(() => options.openConfiguration()));
		this.discardButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		this.discardButton.label = localize('mcpForm.discard', "Discard Changes");
		this._register(this.discardButton.onDidClick(() => this.discard()));
		this.saveButton = this._register(new Button(footer, defaultButtonStyles));
		this.saveButton.label = localize('mcpForm.save', "Save");
		this._register(this.saveButton.onDidClick(() => void this.save()));

		this.updateButtons();
	}

	get isDirty(): boolean {
		if (!this.state || !this.initialState || !this.baseline) {
			return false;
		}
		// Compare normalized configurations so that, for example, `args: []` in the file does not count as a change.
		return !equals(toMcpServerConfiguration(this.state, this.baseline), toMcpServerConfiguration(this.initialState, this.baseline));
	}

	/**
	 * Shows the configuration of {@link input}. Unsaved edits to the same server
	 * are kept when its configuration changes on disk.
	 */
	setInput(input: IMcpServerConfigurationFormInput): void {
		const sameServer = this.input?.id === input.id && this.input.format === input.format;
		this.input = input;
		if (sameServer && (this.saving || equals(input.config, this.baseline))) {
			return;
		}
		if (sameServer && this.isDirty) {
			this.rebase(input.config);
			return;
		}
		this.reset(input.config);
	}

	focus(): void {
		this.kindRadio.focusActiveItem();
	}

	private appendField(parent: HTMLElement, label: string, optional = false): HTMLElement {
		const field = DOM.append(parent, $('.mcp-config-form-field'));
		const labelEl = DOM.append(field, $('.mcp-config-form-label'));
		labelEl.textContent = label;
		if (optional) {
			DOM.append(labelEl, $('span.mcp-config-form-optional', undefined, localize('mcpForm.optional', "(optional)")));
		}
		return field;
	}

	private appendHint(parent: HTMLElement, hint: string): HTMLElement {
		return DOM.append(parent, $('.mcp-config-form-hint', undefined, hint));
	}

	/** Offers only what the destination file can store; an unsupported kind already in the file stays selectable. */
	private renderCapabilities(format: McpResourceFormat, currentKind: McpServerFormKind): void {
		this.capabilities = getMcpServerFormCapabilities(format);
		const kinds = this.capabilities.kinds.includes(currentKind) ? this.capabilities.kinds : [...this.capabilities.kinds, currentKind];
		// Rebuilding the options would move focus out of the server type control during a refresh.
		if (!equals(kinds, this.kinds)) {
			this.kinds = kinds;
			// Labels are the `type` values written to the file, so they are not localized.
			this.kindRadio.setItems(this.kinds.map(kind => {
				switch (kind) {
					case McpServerFormKind.Stdio:
						return { text: 'stdio', tooltip: localize('mcpForm.type.stdio.tooltip', "Run the server as a local process that communicates over standard input and output") };
					case McpServerFormKind.Http:
						return { text: 'http', tooltip: localize('mcpForm.type.http.tooltip', "Connect to a remote server using Streamable HTTP, falling back to SSE") };
					case McpServerFormKind.Sse:
						return { text: 'sse', tooltip: localize('mcpForm.type.sse.tooltip', "Connect to a remote server using Server-Sent Events") };
				}
			}));
		}
		this.envFileField.style.display = this.capabilities.envFile ? '' : 'none';
		this.cwdField.style.display = this.capabilities.cwd ? '' : 'none';
		// VS Code variables such as ${workspaceFolder} are only resolved in VS Code's own mcp.json.
		this.cwdInput.setPlaceHolder(format === McpResourceFormat.Vscode ? '${workspaceFolder}' : '/path/to/project');
		this.envHint.textContent = format === McpResourceFormat.CopilotGlobal
			? localize('mcpForm.env.hintCopilotGlobal', "Values are read by the Copilot CLI. VS Code input variables such as ${input:id} are not supported in this file.")
			: this.capabilities.inputVariables
				? localize('mcpForm.env.hint', "Use ${input:id} to be prompted for a value, such as an API key, instead of storing it in this file.")
				: '';
		this.envHint.style.display = this.envHint.textContent ? '' : 'none';
	}

	private appendInput(parent: HTMLElement, options: { placeholder: string; ariaLabel: string }, getError: () => string | undefined, onChange: (value: string) => void): InputBox {
		const input = this._register(new InputBox(parent, this.contextViewService, {
			...options,
			inputBoxStyles: formInputBoxStyles,
			validationOptions: {
				validation: () => {
					const content = getError();
					return content ? { content, type: MessageType.ERROR } : null;
				},
			},
		}));
		this._register(input.onDidChange(value => {
			onChange(value);
			this.onDidChangeState();
		}));
		return input;
	}

	private registerKeyValueList(list: KeyValueList, onChange: (entries: IMcpServerFormKeyValue[]) => void): void {
		this._register(list.onDidChange(() => {
			onChange(list.value);
			this.onDidChangeState();
		}));
		this._register(list.onDidChangeRows(() => this._onDidChangeContent.fire()));
	}

	private renderState(): void {
		const { state, input } = this;
		if (!state || !input) {
			return;
		}
		this.renderCapabilities(input.format, state.kind);
		this.kindRadio.setActiveItem(this.kinds.indexOf(state.kind));
		this.commandInput.value = state.command;
		this.argsInput.value = state.args;
		this.envFileInput.value = state.envFile;
		this.cwdInput.value = state.cwd;
		this.urlInput.value = state.url;
		// Lists edit the state in place, so give them copies to keep the initial state intact. A list
		// whose rows are unchanged keeps its DOM, so a refresh does not interrupt typing in a row.
		if (equals(this.envList.value, state.env)) {
			state.env = this.envList.value;
		} else {
			this.envList.value = state.env = state.env.map(entry => ({ ...entry }));
		}
		if (equals(this.headersList.value, state.headers)) {
			state.headers = this.headersList.value;
		} else {
			this.headersList.value = state.headers = state.headers.map(entry => ({ ...entry }));
		}
		this.updateSections();
		this.onDidChangeState();
	}

	private updateSections(): void {
		const isStdio = this.state?.kind === McpServerFormKind.Stdio;
		this.stdioSection.style.display = isStdio ? '' : 'none';
		this.remoteSection.style.display = isStdio ? 'none' : '';
		this._onDidChangeContent.fire();
	}

	private onDidChangeState(): void {
		this.validation = this.validate();
		this.envList.setError(this.validation.env);
		this.headersList.setError(this.validation.headers);
		this.formatErrorEl.textContent = this.validation.format ?? '';
		this.formatErrorEl.style.display = this.validation.format ? '' : 'none';
		this.updateButtons();
		this._onDidChangeContent.fire();
	}

	private updateButtons(): void {
		const dirty = this.isDirty;
		this.discardButton.enabled = dirty && !this.saving;
		this.saveButton.enabled = dirty && !this.saving && isMcpServerFormValid(this.validation);
		this.saveButton.label = this.saving ? localize('mcpForm.saving', "Saving...") : localize('mcpForm.save', "Save");
	}

	private validate(): IMcpServerFormValidation {
		const { state, initialState, input, baseline } = this;
		if (!state || !initialState || !input || !baseline) {
			return {};
		}
		const validation = validateMcpServerFormState(state);
		// Only check the file format once the fields themselves are valid, and only against the edit, so values already in the file never block saving.
		if (isMcpServerFormValid(validation) && this.isDirty) {
			const format = getMcpServerFormatError(input.name, toMcpServerConfiguration(initialState, baseline), toMcpServerConfiguration(state, baseline), input.format);
			if (format) {
				return { format };
			}
		}
		return validation;
	}

	/**
	 * Moves unsaved edits onto {@link config}, the configuration now in the file: fields the user
	 * edited keep their edits and all other fields show the file's values. Saving then writes only
	 * the user's edits, so changes made to the file in the meantime are kept.
	 */
	private rebase(config: IMcpServerConfiguration): void {
		const { state, initialState } = this;
		if (!state || !initialState) {
			this.reset(config);
			return;
		}
		const next = toMcpServerFormState(config);
		const merged: IMcpServerFormState = {
			kind: equals(state.kind, initialState.kind) ? next.kind : state.kind,
			command: equals(state.command, initialState.command) ? next.command : state.command,
			args: equals(state.args, initialState.args) ? next.args : state.args,
			cwd: equals(state.cwd, initialState.cwd) ? next.cwd : state.cwd,
			envFile: equals(state.envFile, initialState.envFile) ? next.envFile : state.envFile,
			env: equals(state.env, initialState.env) ? next.env : state.env,
			url: equals(state.url, initialState.url) ? next.url : state.url,
			headers: equals(state.headers, initialState.headers) ? next.headers : state.headers,
		};
		this.baseline = config;
		this.initialState = toMcpServerFormState(config);
		this.state = merged;
		this.renderState();
	}

	/** Shows {@link config}, the latest configuration from the file, without any edits. */
	private reset(config: IMcpServerConfiguration): void {
		this.baseline = config;
		this.initialState = toMcpServerFormState(config);
		this.state = toMcpServerFormState(config);
		this.renderState();
	}

	private discard(): void {
		if (!this.input) {
			return;
		}
		this.reset(this.input.config);
		this.focus();
	}

	private updateAriaLabel(): void {
		const label = localize('mcpForm.ariaLabel', "MCP server configuration");
		if (!this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.McpServerConfiguration)) {
			this.element.setAttribute('aria-label', label);
			return;
		}
		const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
		this.element.setAttribute('aria-label', keybinding
			? localize('mcpForm.ariaLabelWithHelp', "{0}, use {1} for accessibility help", label, keybinding)
			: localize('mcpForm.ariaLabelWithHelpNoKeybinding', "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding", label));
	}

	private async save(): Promise<void> {
		const { input, state, baseline } = this;
		if (!input || !state || !baseline || this.saving || !isMcpServerFormValid(this.validate())) {
			return;
		}

		const config = toMcpServerConfiguration(state, baseline);
		const label = input.label || input.name;
		this.saving = true;
		this.updateButtons();
		try {
			await input.save(baseline, config);
			if (this.input?.id === input.id) {
				this.baseline = config;
				this.initialState = toMcpServerFormState(config);
			}
			status(localize('mcpForm.saved', "Saved configuration for {0}", label));
		} catch (error) {
			this.notificationService.error(localize('mcpForm.saveFailed', "Could not save the configuration of MCP server '{0}': {1}", label, getErrorMessage(error)));
		} finally {
			this.saving = false;
			this.onDidChangeState();
		}
	}
}
