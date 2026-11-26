/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Fields, labels, hints, errors and the footer look the same as in the form that edits an installed server.
import '../../../../mcp/browser/media/mcpServerConfigurationForm.css';
import './media/mcpServerInstallForm.css';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../base/browser/ui/button/button.js';
import { InputBox, MessageType } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { SelectBox } from '../../../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { escapeIcons } from '../../../../../../base/common/iconLabels.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { AgentCustomizationInstallationValueCategory, IAgentCustomizationInstallationAnswers, IAgentCustomizationInstallationChoice, IAgentCustomizationInstallationConfigurationRequest, IAgentCustomizationInstallationSecretPrompt, IAgentCustomizationInstallationValuePrompt } from '../../../../../../platform/agentHost/common/agent.js';
import { configuredNumberPattern, configuredVariableReferencePattern, maxConfiguredValueBytes } from '../../../../../../platform/agentHost/common/customizationInstallationValues.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultSelectBoxStyles, getInputBoxStyle } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { hasNativeContextMenu } from '../../../../../../platform/window/common/window.js';
import { settingsTextInputBorder } from '../../../../preferences/common/settingsEditorColorRegistry.js';

const $ = DOM.$;

// Match the Settings editor, whose inputs stay visible on themes with a faint `input.border`.
const formInputBoxStyles = getInputBoxStyle({ inputBorder: settingsTextInputBorder });

/** The control for one value or secret of a transport choice. */
interface IInstallFormField {
	/** Shows the field's error, if it has one, and returns whether the field is valid. */
	validate(): boolean;
	focus(): void;
	/** The values to submit, in order. Empty when the field is left unset. */
	getValues(): string[];
}

/** The fields of one transport choice. Every choice keeps its own, so switching back keeps what was entered. */
interface IInstallFormSection {
	readonly choice: IAgentCustomizationInstallationChoice;
	readonly element: HTMLElement;
	readonly values: readonly IInstallFormField[];
	readonly secrets: readonly IInstallFormField[];
}

interface IFieldLabel {
	readonly text: string;
	/** The name in the configuration, shown when {@link text} is a friendlier title. */
	readonly key?: string;
	readonly optional?: boolean;
}

interface IInputFieldOptions {
	readonly label: IFieldLabel;
	readonly hints: readonly (string | undefined)[];
	readonly placeholder?: string;
	readonly password?: boolean;
	/** Takes one value per line. */
	readonly multiline?: boolean;
	validate(text: string): string | undefined;
}

/** Shows values that are still to be entered as `<name>`. */
function toPlaceholders(text: string): string {
	return text.replace(/\$\{input:(?<name>[^}]*)\}/g, '<$<name>>');
}

function splitLines(text: string): string[] {
	return text.split(/\r?\n/).filter(line => line.length > 0);
}

/** UI validation for one configured value; the host revalidates and the runtime remains authoritative. */
function validateConfiguredValue(value: IAgentCustomizationInstallationValuePrompt, input: string, omittable: boolean): string | undefined {
	if (!input) {
		return omittable ? undefined : localize('agentHost.customizationInstall.valueRequired', "A value is required.");
	}
	if (input.includes('\0') || new TextEncoder().encode(input).byteLength > maxConfiguredValueBytes) {
		return localize('agentHost.customizationInstall.valueInvalid', "This value is not allowed.");
	}
	if (value.valueType === 'number') {
		return configuredNumberPattern.test(input) ? undefined : localize('agentHost.customizationInstall.numberInvalid', "Enter a number, for example 42 or -1.5e3.");
	}
	return configuredVariableReferencePattern.test(input)
		? localize('agentHost.customizationInstall.variableReference', "Variable references such as $NAME or ${NAME} are not allowed.")
		: undefined;
}

/** UI validation for a secret, matching the host's checks. Never echoes the secret. */
function validateSecret(input: string): string | undefined {
	if (!input) {
		return localize('agentHost.customizationInstall.secretRequired', "A value is required.");
	}
	if (input.includes('\0')) {
		return localize('agentHost.customizationInstall.secretInvalid', "This secret contains characters that are not allowed.");
	}
	return new TextEncoder().encode(input).byteLength > maxConfiguredValueBytes
		? localize('agentHost.customizationInstall.secretTooLong', "This secret is longer than {0} bytes.", maxConfiguredValueBytes)
		: undefined;
}

/** Names the part of the configuration a value goes to, so a bare key such as `-d` has context. */
function getGroupLabel(category: AgentCustomizationInstallationValueCategory): string {
	switch (category) {
		case 'header':
			return localize('mcpInstallForm.group.headers', "Headers");
		case 'url-variable':
			return localize('mcpInstallForm.group.urlVariables', "URL Variables");
		case 'environment-variable':
			return localize('mcpInstallForm.group.environmentVariables', "Environment Variables");
		case 'runtime-argument':
		case 'package-argument':
			return localize('mcpInstallForm.group.arguments', "Arguments");
	}
}

/**
 * Collects everything an Agent Host needs to install an MCP server in one form:
 * how to connect, the values and secrets that connection needs, and a summary of
 * what will be configured. Submitting yields the answers to apply the installation with.
 *
 * All text of the request is untrusted and only ever rendered as plain text.
 */
export class McpServerInstallForm extends Disposable {

	private readonly _onDidSubmit = this._register(new Emitter<IAgentCustomizationInstallationAnswers>());
	/** Fires with the answers for the selected connection, once all of its fields are valid. */
	readonly onDidSubmit = this._onDidSubmit.event;

	private readonly _onDidCancel = this._register(new Emitter<void>());
	readonly onDidCancel = this._onDidCancel.event;

	readonly element: HTMLElement;

	private readonly transportRadio: Radio | undefined;
	private readonly scrollable: DomScrollableElement;
	/** Inputs that take one value per line. Their height follows their content, which can only be measured while they are shown. */
	private readonly multilineInputs: InputBox[] = [];
	private readonly summary: HTMLElement;
	private readonly notice: HTMLElement;
	private readonly installButton: Button;
	private readonly sections: readonly IInstallFormSection[];
	private active: IInstallFormSection;

	constructor(
		container: HTMLElement,
		private readonly request: IAgentCustomizationInstallationConfigurationRequest,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		const title = localize('mcpInstallForm.title', "Install {0}", request.displayName);
		this.element = DOM.append(container, $('.mcp-config-form.mcp-install-form', { role: 'form', 'aria-label': title }));
		DOM.append(this.element, $('.mcp-install-form-title', { role: 'heading', 'aria-level': '2' }, title));

		// The fields scroll when the host is shorter than the form; the title and the footer stay in view.
		const viewport = $('.mcp-install-form-viewport');
		const body = DOM.append(viewport, $('.mcp-install-form-body'));
		this.scrollable = this._register(new DomScrollableElement(viewport, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Visible, useShadows: false }));
		const scrollableNode = this.scrollable.getDomNode();
		scrollableNode.classList.add('mcp-install-form-scrollable');
		this.element.appendChild(scrollableNode);
		const resizeObserver = this._register(new DOM.DisposableResizeObserver('McpServerInstallForm.scrollable', () => this.layout(), DOM.getWindow(container)));
		this._register(resizeObserver.observe(scrollableNode));
		this._register(resizeObserver.observe(body));
		// Moving focus to a field out of view scrolls the viewport without going through the scrollbar.
		this._register(DOM.addDisposableListener(viewport, DOM.EventType.SCROLL, () => this.scrollable.scanDomNode()));

		const recommended = request.choices.findIndex(choice => choice.choiceId === request.recommendedChoiceId);
		const initial = Math.max(0, recommended);
		if (request.choices.length > 1) {
			const label = localize('mcpInstallForm.connection', "Connection");
			const field = DOM.append(body, $('.mcp-config-form-field'));
			this.appendLabel(field, { text: label });
			this.transportRadio = this._register(new Radio({
				className: 'segmented',
				ariaLabel: label,
				items: request.choices.map((choice, index) => {
					const text = index === recommended ? localize('mcpInstallForm.recommended', "{0} (Recommended)", choice.transport) : choice.transport;
					return {
						// Radio labels render `$(icon)` syntax.
						text: escapeIcons(text),
						ariaLabel: text,
						tooltip: choice.endpointSummary ?? choice.command,
						isActive: index === initial,
					};
				}),
			}));
			field.appendChild(this.transportRadio.domNode);
			this._register(this.transportRadio.onDidSelect(index => this.select(this.sections[index])));
		}

		this.summary = DOM.append(body, $('dl.mcp-install-form-summary'));
		this.sections = request.choices.map(choice => this.createSection(body, choice));

		const footer = DOM.append(this.element, $('.mcp-config-form-footer'));
		this.notice = DOM.append(footer, $('.mcp-config-form-hint.mcp-install-form-notice'));
		const cancelButton = this._register(new Button(footer, { ...defaultButtonStyles, secondary: true }));
		cancelButton.label = localize('mcpInstallForm.cancel', "Cancel");
		this._register(cancelButton.onDidClick(() => this._onDidCancel.fire()));
		this.installButton = this._register(new Button(footer, defaultButtonStyles));
		this.installButton.label = localize('mcpInstallForm.install', "Install");
		this._register(this.installButton.onDidClick(() => this.submit()));

		this._register(DOM.addStandardDisposableListener(this.element, DOM.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter) && DOM.isHTMLInputElement(e.target)) {
				e.preventDefault();
				this.submit();
			} else if (e.equals(KeyCode.Escape)) {
				// Handled here, so the surface the form is shown in does not close as well.
				e.preventDefault();
				e.stopPropagation();
				this._onDidCancel.fire();
			}
		}));

		this.active = this.sections[initial];
		this.select(this.active);
	}

	focus(): void {
		const firstField = this.active.values[0] ?? this.active.secrets[0];
		if (this.transportRadio) {
			this.transportRadio.focusActiveItem();
		} else if (firstField) {
			firstField.focus();
		} else {
			this.installButton.focus();
		}
	}

	private select(section: IInstallFormSection): void {
		this.active = section;
		for (const candidate of this.sections) {
			const hasFields = candidate.values.length + candidate.secrets.length > 0;
			candidate.element.style.display = candidate === section && hasFields ? '' : 'none';
		}

		const { choice } = section;
		DOM.clearNode(this.summary);
		const addRow = (term: string, description: string, code = false) => {
			DOM.append(this.summary, $('dt', undefined, term));
			DOM.append(this.summary, $(code ? 'dd.mcp-install-form-code' : 'dd', undefined, description));
		};
		addRow(localize('mcpInstallForm.server', "Server"), this.request.serverName);
		if (this.request.target !== this.request.serverName) {
			addRow(localize('mcpInstallForm.destination', "Destination"), this.request.target);
		}
		if (choice.command !== undefined) {
			addRow(localize('mcpInstallForm.command', "Command"), toPlaceholders(choice.command), true);
		} else if (choice.endpointSummary !== undefined) {
			addRow(localize('mcpInstallForm.endpoint', "Endpoint"), choice.endpointSummary, true);
		}
		const env = Object.entries(choice.env ?? {});
		if (env.length) {
			addRow(localize('mcpInstallForm.environment', "Environment"), env.map(([name, value]) => `${name}=${toPlaceholders(value)}`).join('\n'), true);
		}

		this.notice.textContent = choice.command !== undefined
			? localize('mcpInstallForm.localNotice', "MCP servers can run tools and access local files. Only install servers from sources you trust.")
			: localize('mcpInstallForm.remoteNotice', "MCP servers can run tools and access external services. Only install servers from sources you trust.");
		this.layout();
	}

	/** Sizes the multi-line inputs to their content and the scrollbar to the fields. */
	private layout(): void {
		for (const input of this.multilineInputs) {
			input.layout();
		}
		this.scrollable.scanDomNode();
	}

	private submit(): void {
		const { choice, values, secrets } = this.active;
		// Every field is checked, so all problems show at once.
		const invalid = [...values, ...secrets].filter(field => !field.validate());
		if (invalid.length) {
			invalid[0].focus();
			return;
		}
		this._onDidSubmit.fire({
			choiceId: choice.choiceId,
			inputs: choice.values.flatMap((value, index) => values[index].getValues().map(entry => ({ key: value.key, category: value.category, value: entry }))),
			secrets: choice.secrets.map((secret, index) => ({ placeholder: secret.placeholder, value: secrets[index].getValues()[0] })),
		});
	}

	private createSection(parent: HTMLElement, choice: IAgentCustomizationInstallationChoice): IInstallFormSection {
		const element = DOM.append(parent, $('.mcp-install-form-fields'));
		// Fields are grouped by what they configure. A group sits where its first field is in the plan.
		const groups = new Map<string, HTMLElement>();
		const getGroup = (label: string) => {
			let group = groups.get(label);
			if (!group) {
				group = DOM.append(element, $('.mcp-config-form-section', { role: 'group', 'aria-label': label }));
				DOM.append(group, $('.mcp-install-form-group-title', undefined, label));
				groups.set(label, group);
			}
			return group;
		};
		return {
			choice,
			element,
			values: choice.values.map(value => this.createValueField(getGroup(getGroupLabel(value.category)), value)),
			secrets: choice.secrets.map(secret => this.createSecretField(getGroup(localize('mcpInstallForm.group.secrets', "Secrets")), secret)),
		};
	}

	private createValueField(parent: HTMLElement, value: IAgentCustomizationInstallationValuePrompt): IInstallFormField {
		const omittable = !value.required || value.defaultValue !== undefined;
		const label: IFieldLabel = {
			text: value.title ?? value.key,
			key: value.title !== undefined && value.title !== value.key ? value.key : undefined,
			optional: omittable && value.defaultValue === undefined,
		};
		const allowed = value.valueType === 'enum' ? value.enumValues ?? [] : value.valueType === 'boolean' ? ['true', 'false'] : undefined;
		const defaultPlaceholder = value.defaultValue !== undefined ? localize('mcpInstallForm.defaultPlaceholder', "Default: {0}", value.defaultValue) : undefined;

		if (value.isRepeated) {
			return this.createInputField(parent, {
				label,
				hints: [value.description, allowed
					? localize('mcpInstallForm.repeatedAllowedHint', "Enter one value per line: {0}", allowed.join(', '))
					: localize('mcpInstallForm.repeatedHint', "Enter one value per line.")],
				placeholder: defaultPlaceholder,
				multiline: true,
				validate: text => {
					const lines = splitLines(text);
					if (!lines.length) {
						return validateConfiguredValue(value, '', omittable);
					}
					for (const [index, line] of lines.entries()) {
						const error = allowed && !allowed.includes(line)
							? localize('mcpInstallForm.notAllowed', "Enter one of: {0}", allowed.join(', '))
							: validateConfiguredValue(value, line, false);
						if (error) {
							return localize('mcpInstallForm.lineError', "Line {0}: {1}", index + 1, error);
						}
					}
					return undefined;
				},
			});
		}
		// On or off is enough unless leaving the value out is a third answer, which the choices below offer.
		if (value.valueType === 'boolean' && !label.optional) {
			return this.createCheckboxField(parent, value, label);
		}
		if (allowed) {
			const unset = value.defaultValue !== undefined
				? localize('mcpInstallForm.useDefault', "Default ({0})", value.defaultValue)
				: omittable ? localize('mcpInstallForm.notSet', "Not set") : localize('mcpInstallForm.selectValue', "Select a value");
			return this.createSelectField(parent, value, label, unset, allowed, omittable);
		}
		return this.createInputField(parent, {
			label,
			hints: [value.description],
			placeholder: defaultPlaceholder ?? (value.valueType === 'path' ? localize('mcpInstallForm.pathPlaceholder', "Path on the Agent Host machine") : undefined),
			validate: text => validateConfiguredValue(value, text, omittable),
		});
	}

	private createSecretField(parent: HTMLElement, secret: IAgentCustomizationInstallationSecretPrompt): IInstallFormField {
		return this.createInputField(parent, {
			label: { text: secret.title ?? secret.key, key: secret.title !== undefined && secret.title !== secret.key ? secret.key : undefined },
			hints: [localize('mcpInstallForm.secretHint', "Stored by the Agent Host and never shown again.")],
			password: true,
			validate: validateSecret,
		});
	}

	private createInputField(parent: HTMLElement, options: IInputFieldOptions): IInstallFormField {
		const field = DOM.append(parent, $('.mcp-config-form-field'));
		this.appendLabel(field, options.label);
		// Problems show below the field rather than in a popup, so several can be read at once.
		const input = this._register(new InputBox(field, undefined, {
			ariaLabel: this.getAriaLabel(options.label),
			placeholder: options.placeholder,
			type: options.password ? 'password' : 'text',
			flexibleHeight: options.multiline,
			flexibleMaxHeight: 160,
			inputBoxStyles: formInputBoxStyles,
			validationOptions: {
				validation: text => {
					const error = options.validate(text);
					setError(error);
					return error ? { type: MessageType.ERROR } : null;
				},
			},
		}));
		if (options.multiline) {
			this.multilineInputs.push(input);
		}
		const setError = this.appendMessages(field, input.inputElement, options.hints);
		return {
			validate: () => input.validate() === undefined,
			focus: () => input.focus(),
			getValues: () => options.multiline ? splitLines(input.value) : input.value ? [input.value] : [],
		};
	}

	private createSelectField(parent: HTMLElement, value: IAgentCustomizationInstallationValuePrompt, label: IFieldLabel, unset: string, allowed: readonly string[], omittable: boolean): IInstallFormField {
		const field = DOM.append(parent, $('.mcp-config-form-field'));
		this.appendLabel(field, label);
		// The first option leaves the value unset.
		let selected = 0;
		const select = this._register(new SelectBox(
			[{ text: unset }, ...allowed.map(text => ({ text }))],
			selected,
			this.contextViewService,
			defaultSelectBoxStyles,
			{ useCustomDrawn: !hasNativeContextMenu(this.configurationService), ariaLabel: this.getAriaLabel(label) },
		));
		const container = DOM.append(field, $('.mcp-install-form-select'));
		select.render(container);
		// A select box renders its `<select>`, which is what takes focus, as the only child of the empty container.
		const setError = this.appendMessages(field, container.firstElementChild, [value.description]);
		const validate = () => {
			const error = selected === 0 ? validateConfiguredValue(value, '', omittable) : undefined;
			setError(error);
			return !error;
		};
		this._register(select.onDidSelect(e => {
			selected = e.index;
			validate();
		}));
		return {
			validate,
			focus: () => select.focus(),
			getValues: () => selected === 0 ? [] : [allowed[selected - 1]],
		};
	}

	private createCheckboxField(parent: HTMLElement, value: IAgentCustomizationInstallationValuePrompt, label: IFieldLabel): IInstallFormField {
		const field = DOM.append(parent, $('.mcp-config-form-field'));
		const row = DOM.append(field, $('.mcp-install-form-checkbox'));
		const checkbox = this._register(new Checkbox(this.getAriaLabel(label), value.defaultValue === 'true', defaultCheckboxStyles));
		row.appendChild(checkbox.domNode);
		const labelElement = this.appendLabel(row, label);
		this._register(DOM.addDisposableListener(labelElement, DOM.EventType.CLICK, () => {
			checkbox.checked = !checkbox.checked;
		}));
		this.appendMessages(field, checkbox.domNode, [value.description]);
		return {
			validate: () => true,
			focus: () => checkbox.focus(),
			// Unchecked only needs saying when leaving the value out would mean something else.
			getValues: () => checkbox.checked ? ['true'] : value.required || value.defaultValue === 'true' ? ['false'] : [],
		};
	}

	private appendLabel(parent: HTMLElement, label: IFieldLabel): HTMLElement {
		const element = DOM.append(parent, $('.mcp-config-form-label', undefined, label.text));
		if (label.key !== undefined) {
			DOM.append(element, $('span.mcp-install-form-key', undefined, label.key));
		}
		if (label.optional) {
			DOM.append(element, $('span.mcp-config-form-optional', undefined, localize('mcpInstallForm.optional', "(optional)")));
		}
		return element;
	}

	private getAriaLabel(label: IFieldLabel): string {
		const name = label.key !== undefined ? localize('mcpInstallForm.labelWithKey', "{0}, {1}", label.text, label.key) : label.text;
		return label.optional ? localize('mcpInstallForm.optionalAriaLabel', "{0}, optional", name) : name;
	}

	/**
	 * Adds a field's error line and its hints, and returns how to show or clear the error. They
	 * describe {@link control}, so they are read out when it takes focus: the error first.
	 */
	private appendMessages(field: HTMLElement, control: Element | null, hints: readonly (string | undefined)[]): (error: string | undefined) => void {
		const errorElement = DOM.append(field, $('.mcp-config-form-error', { 'aria-live': 'polite' }));
		const messages = [errorElement];
		for (const hint of hints) {
			if (hint) {
				messages.push(DOM.append(field, $('.mcp-config-form-hint', undefined, hint)));
			}
		}
		const idPrefix = `mcp-install-form-${generateUuid()}`;
		for (const [index, message] of messages.entries()) {
			message.id = `${idPrefix}-${index}`;
		}
		control?.setAttribute('aria-describedby', messages.map(message => message.id).join(' '));
		const setError = (error: string | undefined) => {
			errorElement.textContent = error ?? '';
			errorElement.style.display = error ? '' : 'none';
		};
		setError(undefined);
		return setError;
	}
}
