/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { createInstantHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { InputBox, MessageType } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { SelectBox } from '../../../../../base/browser/ui/selectBox/selectBox.js';
import { Orientation, Sizing, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Action } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { getParseErrorMessage } from '../../../../../base/common/jsonErrorMessages.js';
import { parse, ParseError } from '../../../../../base/common/json.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../platform/list/browser/listService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentSandboxSettingId as Sandbox, IAgentSandboxUserConfiguredPaths } from '../../../../../platform/sandbox/common/settings.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles, defaultCheckboxStyles, getInputBoxStyle, getSelectBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from '../../../codeEditor/browser/simpleEditorOptions.js';
import { IListDataItem, ListSettingWidget, SettingListEvent } from '../../../preferences/browser/settingsWidgets.js';
import { settingsSashBorder, settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { sandboxProfileGroups, SandboxProfilesInput } from './sandboxProfilesInput.js';
import './media/sandboxProfiles.css';

const $ = dom.$;

const SANDBOX_PROFILE_SCHEME = 'vscode-sandbox-profile';
const jsonSchemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

const inputStyles = getInputBoxStyle({ inputBackground: settingsTextInputBackground, inputForeground: settingsTextInputForeground, inputBorder: settingsTextInputBorder });
const selectStyles = getSelectBoxStyles({ selectBackground: settingsSelectBackground, selectForeground: settingsSelectForeground, selectBorder: settingsSelectBorder, selectListBorder: settingsSelectListBorder });

interface IProfileRow {
	readonly id: string;
	readonly name: string;
}

interface IProfileRowTemplate {
	readonly label: HTMLElement;
	readonly actions: HTMLElement;
	readonly disposables: DisposableStore;
	row?: IProfileRow;
}

class ProfileRowRenderer implements IListRenderer<IProfileRow, IProfileRowTemplate> {
	static readonly ID = 'sandboxProfileRow';
	readonly templateId = ProfileRowRenderer.ID;
	private readonly _hoverDelegate = createInstantHoverDelegate();

	constructor(
		private readonly _onDelete: (row: IProfileRow) => void,
		private readonly _instantiationService: IInstantiationService,
		private readonly _hoverService: IHoverService,
	) { }

	renderTemplate(container: HTMLElement): IProfileRowTemplate {
		const disposables = new DisposableStore();
		container.classList.add('profile-list-item');
		dom.append(container, $(`span${ThemeIcon.asCSSSelector(Codicon.shield)}`, { 'aria-hidden': 'true' }));
		const label = dom.append(container, $('.profile-list-item-label'));
		disposables.add(this._hoverService.setupDelayedHoverAtMouse(label, () => ({ content: template.row?.name ?? '', style: HoverStyle.Mouse })));
		const actions = dom.append(container, $('.profile-list-item-actions'));
		const template: IProfileRowTemplate = { label, actions, disposables };
		const run = (handler: (row: IProfileRow) => void) => async () => {
			if (template.row) {
				handler(template.row);
			}
		};
		const toolbar = disposables.add(this._instantiationService.createInstance(WorkbenchToolBar, actions, { hoverDelegate: this._hoverDelegate }));
		toolbar.setActions([
			disposables.add(new Action('sandboxProfiles.deleteRow', localize('delete', "Delete Profile"), ThemeIcon.asClassName(Codicon.trash), true, run(this._onDelete))),
		]);
		return template;
	}

	renderElement(row: IProfileRow, _index: number, template: IProfileRowTemplate): void {
		template.row = row;
		template.label.textContent = row.name;
	}

	disposeTemplate(template: IProfileRowTemplate): void {
		template.disposables.dispose();
	}

	dispose(): void {
		this._hoverDelegate.dispose();
	}
}

/**
 * Manages local sandbox profiles using the Profiles editor layout and the Settings editor controls.
 */
export class SandboxProfilesEditor extends EditorPane {
	static readonly ID = 'workbench.editor.sandboxProfiles';
	private _root!: HTMLElement;
	private _splitView: SplitView<number> | undefined;
	private _list!: WorkbenchList<IProfileRow>;
	private _newProfileButton!: Button;
	private _header!: HTMLElement;
	private _body!: HTMLElement;
	private _nameInput: InputBox | undefined;
	private _showNameValidation = false;
	private _syncingSelection = false;
	private readonly _selectionListener = this._register(new MutableDisposable());
	private readonly _controls = this._register(new DisposableStore());
	private readonly _invalidJson = new Set<CodeEditorWidget>();
	private _bodyScrollable!: DomScrollableElement;

	constructor(group: IEditorGroup,
		@ITelemetryService telemetry: ITelemetryService,
		@IThemeService theme: IThemeService,
		@IStorageService storage: IStorageService,
		@IDialogService private readonly _dialogs: IDialogService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { super(SandboxProfilesEditor.ID, group, telemetry, theme, storage); }

	private get _profileInput(): SandboxProfilesInput | undefined {
		return this.input instanceof SandboxProfilesInput ? this.input : undefined;
	}

	// eslint-disable-next-line ts-eslint-js/naming-convention -- EditorPane contract
	protected override createEditor(parent: HTMLElement): void {
		this._root = dom.append(parent, $('.sandbox-profiles-editor'));
		const sidebarView = dom.append(this._root, $('.sidebar-view'));
		const newProfile = this._newProfileButton = this._register(new Button(dom.append(sidebarView, $('.new-profile-button')), defaultButtonStyles));
		newProfile.label = localize('new', "New Profile");
		this._register(newProfile.onDidClick(() => this._createProfile()));
		this._list = this._register(this._instantiationService.createInstance(WorkbenchList<IProfileRow>, 'SandboxProfiles', dom.append(sidebarView, $('.profiles-list')),
			{ getHeight: () => 22, getTemplateId: () => ProfileRowRenderer.ID } satisfies IListVirtualDelegate<IProfileRow>,
			[this._register(new ProfileRowRenderer(row => this._deleteProfile(row), this._instantiationService, this._hoverService))], {
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			openOnSingleClick: true,
			identityProvider: { getId: row => row.id },
			accessibilityProvider: {
				getAriaLabel: row => row.name,
				getWidgetAriaLabel: () => localize('library', "Sandbox profiles"),
			},
		}));
		this._register(this._list.onDidChangeSelection(event => this._onDidSelectRow(event.elements[0])));

		const contentsView = dom.append(this._root, $('.contents-view'));
		this._header = dom.append(contentsView, $('.profile-header'));
		const bodyContent = $('.profile-body-content');
		this._body = dom.append(bodyContent, $('.profile-body-inner'));
		const bodyScrollable = this._bodyScrollable = this._register(new DomScrollableElement(bodyContent, { vertical: ScrollbarVisibility.Auto, horizontal: ScrollbarVisibility.Hidden, useShadows: true }));
		dom.append(contentsView, bodyScrollable.getDomNode()).classList.add('profile-body');
		const resizeObserver = this._register(new dom.DisposableResizeObserver('sandboxProfilesBody', () => bodyScrollable.scanDomNode(), dom.getWindow(parent)));
		this._register(resizeObserver.observe(this._body));
		this._register(resizeObserver.observe(bodyContent));

		this._splitView = this._register(new SplitView(this._root, { orientation: Orientation.HORIZONTAL, proportionalLayout: true }));
		this._splitView.addView({
			onDidChange: Event.None, element: sidebarView, minimumSize: 160, maximumSize: 320,
			layout: (width, _offset, height) => {
				sidebarView.style.width = `${width}px`;
				if (height) {
					const listHeight = height - 40;
					this._list.getHTMLElement().style.height = `${listHeight}px`;
					this._list.layout(listHeight, width);
				}
			},
		}, 220, undefined, true);
		this._splitView.addView({
			onDidChange: Event.None, element: contentsView, minimumSize: 360, maximumSize: Number.POSITIVE_INFINITY,
			layout: width => { contentsView.style.width = `${width}px`; },
		}, Sizing.Distribute, undefined, true);
		this.updateStyles();
	}

	override updateStyles(): void {
		const separatorBorder = this.theme.getColor(settingsSashBorder);
		if (separatorBorder) {
			this._splitView?.style({ separatorBorder });
		}
	}

	layout(dimension: dom.Dimension): void {
		dom.size(this._root, dimension.width, dimension.height);
		this._splitView?.layout(dimension.width, dimension.height);
	}

	override focus(): void {
		// Like the Profiles editor, focus the selected profile in the list rather than its name field.
		if (this._list.length) {
			this._list.domFocus();
		} else {
			this._newProfileButton.focus();
		}
	}

	override async setInput(input: SandboxProfilesInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested) {
			const listeners = new DisposableStore();
			listeners.add(input.onDidSelect(() => this._render(input)));
			listeners.add(input.onDidChangeProfiles(() => {
				this._renderList(input);
				// Another window can take or free the name being edited.
				this._nameInput?.validate();
			}));
			this._selectionListener.value = listeners;
			this._render(input);
		}
	}

	override clearInput(): void {
		this._selectionListener.clear();
		this._controls.clear();
		this._invalidJson.clear();
		this._nameInput = undefined;
		super.clearInput();
	}

	/** Saves pending valid changes, then asks before discarding changes that can't be saved. */
	private async _confirmDiscard(input: SandboxProfilesInput): Promise<boolean> {
		input.flush();
		return !input.isDirty() || (await this._dialogs.confirm({
			message: localize('discardPrompt', "Discard unsaved profile changes?"),
			primaryButton: localize('discard', "&&Discard Changes"),
		})).confirmed;
	}

	/** Like the Profiles editor, New Profile saves a profile right away and selects its name to rename it. */
	private async _createProfile(): Promise<void> {
		const input = this._profileInput;
		if (input && await this._confirmDiscard(input)) {
			this._showNameValidation = false;
			const profile = input.createProfile();
			status(localize('created', "Sandbox profile {0} created.", profile.name));
			this._nameInput?.focus();
			this._nameInput?.select();
		}
	}

	private async _deleteProfile(row: IProfileRow): Promise<void> {
		const input = this._profileInput;
		if (!input) {
			return;
		}
		const showInUse = async (hosts: readonly string[]) => {
			await this._dialogs.info(
				localize('deleteInUse', "Sandbox profile '{0}' can't be deleted because it is in use.", row.name),
				localize('deleteInUseDetail', "It is assigned to these remote environments: {0}. Disconnected environments count by their last-known assignment. Connect and choose another profile or Default for them in Remote Environments, then delete it.", hosts.join(', ')),
			);
		};
		const hosts = input.hostsUsingProfile(row.id);
		if (hosts.length) {
			await showInUse(hosts);
			return;
		}
		if ((await this._dialogs.confirm({
			type: 'warning',
			message: localize('deletePrompt', "Delete sandbox profile '{0}'?", row.name),
			detail: localize('deleteDetail', "This removes the profile from this machine."),
			primaryButton: localize('deleteButton', "&&Delete"),
		})).confirmed) {
			if (input.deleteProfile(row.id)) {
				status(localize('deleted', "Sandbox profile {0} deleted.", row.name));
			} else {
				await showInUse(input.hostsUsingProfile(row.id));
			}
		}
	}

	private async _onDidSelectRow(row: IProfileRow | undefined): Promise<void> {
		const input = this._profileInput;
		if (this._syncingSelection || !input || !row || row.id === input.draft?.id) {
			return;
		}
		if (await this._confirmDiscard(input)) {
			this._showNameValidation = false;
			input.select(input.profiles.find(profile => profile.id === row.id));
		} else {
			this._renderList(input);
		}
	}

	private _renderList(input: SandboxProfilesInput): void {
		const rows: IProfileRow[] = input.profiles.map(({ id, name }) => ({ id, name }));
		const index = rows.findIndex(row => row.id === input.draft?.id);
		this._syncingSelection = true;
		try {
			this._list.splice(0, this._list.length, rows);
			this._list.setSelection(index >= 0 ? [index] : []);
			this._list.setFocus(index >= 0 ? [index] : []);
		} finally {
			this._syncingSelection = false;
		}
	}

	private _render(input: SandboxProfilesInput): void {
		this._controls.clear();
		this._invalidJson.clear();
		this._nameInput = undefined;
		dom.clearNode(this._header);
		dom.clearNode(this._body);
		this._renderList(input);
		const draft = input.draft;
		if (!draft) {
			const empty = dom.append(this._header, $('.profiles-empty'));
			dom.append(empty, $('h2.section-title', {}, localize('noProfiles', "No Sandbox Profiles")));
			dom.append(empty, $('p.section-description', {}, localize('noProfilesDescription', "Select New Profile to create a profile from your current sandbox settings. Assign profiles to hosts in Remote Environments.")));
			this._bodyScrollable.scanDomNode();
			return;
		}

		const heading = dom.append(this._header, $('.section-heading'));
		dom.append(heading, renderIcon(Codicon.settings)).setAttribute('aria-hidden', 'true');
		const title = dom.append(heading, $('h2.section-title'));
		title.textContent = draft.name;
		dom.append(this._header, $('p.section-description', {}, localize('autoSaveDescription', "Changes are saved automatically and update the connected hosts using this profile. Assign profiles to hosts in Remote Environments.")));

		const nameRow = dom.append(this._header, $('.inline-field'));
		dom.append(nameRow, $('label.inline-field-label', {}, localize('name', "Name")));
		const nameInput = this._nameInput = this._controls.add(new InputBox(dom.append(nameRow, $('.inline-field-control')), this._contextViewService, {
			inputBoxStyles: inputStyles,
			ariaLabel: localize('profileName', "Profile Name"),
			placeholder: localize('profileName', "Profile Name"),
			validationOptions: {
				validation: () => {
					const message = this._showNameValidation ? input.validationMessage : undefined;
					return message ? { content: message, type: MessageType.ERROR } : null;
				},
			},
		}));
		nameInput.value = draft.name;
		this._controls.add(nameInput.onDidChange(value => {
			draft.name = value;
			this._showNameValidation = true;
			nameInput.validate();
			input.changed();
			title.textContent = value.trim() || input.profiles.find(profile => profile.id === draft.id)?.name || '';
		}));

		const settings = draft.settings;
		const properties = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties();
		for (const group of sandboxProfileGroups) {
			dom.append(this._body, $('h3.settings-group-title', {}, group.title));
			for (const [key, label] of group.fields) {
				const schema = properties[key];
				const description = describe(schema);
				const value = settings[key];
				if (schema?.type === 'boolean') {
					this._boolRow(label, description, value === true, checked => { settings[key] = checked; input.changed(); });
				} else if (key === Sandbox.AgentSandboxEnabled) {
					const values = (schema?.enum ?? []).map(String);
					const control = dom.append(this._settingRow(this._body, label, description), $('.setting-item-select'));
					const select = this._controls.add(new SelectBox(values.map((text, index) => ({ text, description: schema?.enumDescriptions?.[index] })), Math.max(0, values.indexOf(String(value))), this._contextViewService, selectStyles, { ariaLabel: label, useCustomDrawn: true }));
					select.render(control);
					this._controls.add(select.onDidSelect(({ selected }) => { settings[key] = selected; input.changed(); }));
				} else if (key === Sandbox.AgentSandboxUserConfiguredPaths) {
					this._jsonRow(label, key, description, schema, value ?? {}, validateUserConfiguredPaths, parsed => { settings[key] = parsed as IAgentSandboxUserConfiguredPaths; input.changed(); }, input.invalidText(key), text => input.setInvalidText(key, text));
				} else {
					const control = this._settingRow(this._body, label, description);
					this._stringList(control, label, Array.isArray(value) ? value : [], items => { settings[key] = items; input.changed(); });
				}
			}
		}

		this._bodyScrollable.scanDomNode();
	}

	/** Renders a Settings-style row and returns its control container. */
	private _settingRow(parent: HTMLElement, label: string, description: string | undefined): HTMLElement {
		const row = dom.append(parent, $('.setting-item'));
		dom.append(row, $('.setting-item-title', {}, label));
		if (description) {
			dom.append(row, $('.setting-item-description', {}, description));
		}
		return dom.append(row, $('.setting-item-value'));
	}

	/** Renders an inline settings.json editor for an object setting that the Settings editor cannot edit directly. */
	private _jsonRow(label: string, key: string, description: string | undefined, schema: IConfigurationPropertySchema | undefined, value: unknown, validateValue: (value: unknown) => string | undefined, change: (value: unknown) => void, invalidText: string | undefined, setInvalidText: (text: string | undefined) => void): void {
		const control = this._settingRow(this._body, label, description);
		control.classList.add('setting-item-json');
		const frame = dom.append(control, $('.json-frame'));
		const caption = dom.append(frame, $('.json-caption'));
		dom.append(caption, renderIcon(Codicon.json)).setAttribute('aria-hidden', 'true');
		dom.append(caption, $('span.json-caption-key', {}, `"${key}"`));
		const editorContainer = dom.append(frame, $('.json-editor'));
		const message = dom.append(control, $('.json-message', { role: 'alert' }));
		const editor = this._controls.add(this._instantiationService.createInstance(CodeEditorWidget, editorContainer, {
			...getSimpleEditorOptions(this._configurationService),
			ariaLabel: localize('jsonEditor', "{0}, JSON", label),
			lineNumbers: 'on',
			lineNumbersMinChars: 2,
			folding: true,
			wordWrap: 'off',
			automaticLayout: true,
			padding: { top: 4, bottom: 4 },
			scrollbar: { vertical: 'auto', horizontal: 'auto', alwaysConsumeMouseWheel: false },
		}, getSimpleCodeEditorWidgetOptions()));
		// A dedicated document URI associated with the setting's schema lets the JSON language service suggest and validate properties.
		const resource = URI.from({ scheme: SANDBOX_PROFILE_SCHEME, path: `/${key}.json` });
		if (schema) {
			const schemaId = `vscode://schemas/sandbox-profile/${key}`;
			const schemaStore = this._controls.add(new DisposableStore());
			jsonSchemaRegistry.registerSchema(schemaId, toJsonSchema(schema), schemaStore);
			schemaStore.add(jsonSchemaRegistry.registerSchemaAssociation(schemaId, resource.toString()));
		}
		const model = this._controls.add(this._modelService.createModel(invalidText ?? JSON.stringify(value, undefined, 2), this._languageService.createById('json'), resource));
		editor.setModel(model);
		model.updateOptions({ tabSize: 2, insertSpaces: true });
		const resize = () => {
			const height = Math.min(Math.max(editor.getContentHeight(), 60), 280);
			editorContainer.style.height = `${height}px`;
			editor.layout({ width: editorContainer.clientWidth, height });
		};
		this._controls.add(editor.onDidContentSizeChange(resize));
		resize();
		const validate = () => {
			const errors: ParseError[] = [];
			const parsed = parse(model.getValue(), errors, { allowTrailingComma: true, disallowComments: false });
			let problem: string | undefined;
			if (errors.length) {
				const position = model.getPositionAt(errors[0].offset);
				problem = localize('jsonSyntax', "Line {0}, column {1}: {2}", position.lineNumber, position.column, getParseErrorMessage(errors[0].error) || localize('jsonInvalid', "Invalid JSON"));
			} else {
				problem = validateValue(parsed);
			}
			message.textContent = problem ?? '';
			frame.classList.toggle('invalid', !!problem);
			return { problem, parsed };
		};
		if (invalidText !== undefined) {
			// Restored unsaved text that is still invalid.
			this._invalidJson.add(editor);
			validate();
		}
		this._controls.add(model.onDidChangeContent(() => {
			const { problem, parsed } = validate();
			if (problem) {
				this._invalidJson.add(editor);
				setInvalidText(model.getValue());
			} else {
				this._invalidJson.delete(editor);
				change(parsed);
				setInvalidText(undefined);
			}
		}));
	}

	private _boolRow(label: string, description: string | undefined, checked: boolean, change: (checked: boolean) => void): void {
		const row = dom.append(this._body, $('.setting-item.setting-item-bool'));
		dom.append(row, $('.setting-item-title', {}, label));
		const value = dom.append(row, $('.setting-item-value-description'));
		const checkbox = this._controls.add(new Checkbox(label, checked, defaultCheckboxStyles));
		value.appendChild(checkbox.domNode);
		this._controls.add(checkbox.onChange(() => change(checkbox.checked)));
		if (description) {
			const text = dom.append(value, $('.setting-item-description', {}, description));
			this._controls.add(dom.addDisposableListener(text, dom.EventType.CLICK, () => {
				checkbox.checked = !checkbox.checked;
				change(checkbox.checked);
				checkbox.focus();
			}));
		}
	}

	private _stringList(container: HTMLElement, label: string, initial: readonly string[], change: (items: string[]) => void): void {
		const widget = this._controls.add(this._instantiationService.createInstance(ListSettingWidget<IListDataItem>, container));
		let items = [...initial];
		const update = () => widget.setValue(items.map(data => ({ value: { type: 'string', data } })));
		widget.domNode.setAttribute('aria-label', label);
		update();
		this._controls.add(widget.onDidChangeList((event: SettingListEvent<IListDataItem>) => {
			const next = [...items];
			if (event.type === 'remove' || event.type === 'reset') {
				next.splice(event.targetIndex, 1);
			} else if (event.type === 'move') {
				next.splice(event.targetIndex, 0, next.splice(event.sourceIndex, 1)[0]);
			} else {
				const data = String(event.newItem.value.data).trim();
				if (!data) {
					update();
					return;
				}
				if (event.type === 'change' && event.targetIndex > -1) {
					next[event.targetIndex] = data;
				} else {
					next.push(data);
				}
			}
			items = next;
			update();
			change(next);
		}));
	}
}

/** Builds a JSON schema for the inline editor from a configuration property, keeping only JSON Schema fields. */
function toJsonSchema(schema: IConfigurationPropertySchema): IJSONSchema {
	return {
		type: schema.type,
		description: schema.description ?? schema.markdownDescription,
		properties: schema.properties,
		additionalProperties: schema.additionalProperties ?? false,
		defaultSnippets: schema.properties ? [{ body: Object.fromEntries(Object.keys(schema.properties).map(property => [property, []])) }] : undefined,
	};
}

/** Validates the user-configured paths object: each known access level is an array of paths. */
function validateUserConfiguredPaths(value: unknown): string | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return localize('pathsObject', "Expected an object with readwritePaths, readonlyPaths, and deniedPaths.");
	}
	for (const [property, paths] of Object.entries(value)) {
		if (!['readwritePaths', 'readonlyPaths', 'deniedPaths'].includes(property)) {
			return localize('pathsUnknown', "Unknown property \"{0}\". Use readwritePaths, readonlyPaths, or deniedPaths.", property);
		}
		if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string')) {
			return localize('pathsArray', "\"{0}\" must be an array of path strings.", property);
		}
	}
	return undefined;
}

/** Converts a setting's description to plain text, replacing setting references with their IDs. */
function describe(schema: IConfigurationPropertySchema | undefined): string | undefined {
	return (schema?.description ?? schema?.markdownDescription)
		?.replace(/`#([^#`]+)#`/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1');
}
