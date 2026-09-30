/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionHeaderEditors.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { AnchorAlignment, AnchorPosition } from '../../../../../base/browser/ui/contextview/contextview.js';
import { InputBox } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Color } from '../../../../../base/common/color.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IAction } from '../../../../../base/common/actions.js';
import { ColorPickerModel } from '../../../../../editor/contrib/colorPicker/browser/colorPickerModel.js';
import { ColorPickerWidgetType } from '../../../../../editor/contrib/colorPicker/browser/colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../../../../../editor/contrib/colorPicker/browser/colorPickerWidget.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { defaultInputBoxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { SESSIONS_LIST_COLLECTIONS_SETTING } from '../../../../common/sessionConfig.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { formatContrastRatio, getSessionPaletteColorLabel, isSessionPaletteColor, isValidHexColor, normalizeHexColor, resolveSessionColor, SessionColor, SESSION_PALETTE_COLORS, sessionPaletteColorIds, SessionTextColorMode } from '../../../../services/sessions/common/sessionColors.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionCollection, ISessionCollectionsService, SESSION_COLLECTION_ICONS } from '../../../../services/sessions/browser/sessionCollectionsService.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionColor, ISessionSectionColorsService } from '../../../../services/sessions/browser/sessionSectionColorsService.js';

const $ = DOM.$;

const TEXT_COLOR_MODES: readonly SessionTextColorMode[] = [
	SessionTextColorMode.Auto,
	SessionTextColorMode.Light,
	SessionTextColorMode.Dark,
];

export interface ISessionHeaderColorTarget {
	/** `group:<id>`, `workspace:<label>`, `pinned` or `quickchats`. */
	readonly sectionId: string;
	readonly kind: 'group' | 'workspace' | 'section';
	/** Display name: the group name, workspace label, or built-in section name. */
	readonly label: string;
	/** For kind 'group'. */
	readonly groupId?: string;
	/** Header icon (e.g. folder for workspaces, pin for Pinned). */
	readonly icon?: ThemeIcon;
	/** For kind 'workspace': the section's ungrouped sessions in the current collection (for Move to chips). */
	readonly sessions?: readonly ISession[];
}

export interface ISessionHeaderEditorOptions {
	readonly anchor: HTMLElement;
	readonly target: ISessionHeaderColorTarget;
	/** Extra actions rendered as buttons at the bottom (e.g. New Session in Group, Ungroup, Mark Group as Done, Remove Color). Running one closes the popover first. */
	readonly actions?: readonly IAction[];
	/** Called once when the popover closes if anything changed, with a message (e.g. "Edited group 'X'") and an undo restoring the state at open. */
	readonly onDidCommit?: (message: string, undo: () => void) => void;
	readonly onDidClose?: () => void;
}

export interface ISessionCollectionEditorOptions {
	readonly anchor: HTMLElement | { readonly x: number; readonly y: number };
	/** The collection to edit, or undefined to create a new one (created immediately with defaults via ISessionCollectionsService.createCollection, then edited). */
	readonly collectionId?: string;
	readonly onDidCommit?: (message: string, undo: () => void) => void;
	readonly onDidClose?: () => void;
}

export class SessionHeaderEditors extends Disposable {

	private readonly open = this._register(new MutableDisposable<IDisposable>());
	private readonly onDidChangeOpenEmitter = this._register(new Emitter<boolean>());
	readonly onDidChangeOpen: Event<boolean> = this.onDidChangeOpenEmitter.event;
	private opened = false;

	constructor(
		@IContextViewService private readonly contextViewService: IContextViewService,
		@ISessionCollectionsService private readonly collectionsService: ISessionCollectionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	get isOpen(): boolean {
		return this.open.value !== undefined;
	}

	showHeaderEditor(options: ISessionHeaderEditorOptions): void {
		const session = new DisposableStore();
		this.open.value = session;
		this.setOpened(true);

		const view = this.contextViewService.showContextView({
			getAnchor: () => options.anchor,
			anchorAlignment: AnchorAlignment.LEFT,
			anchorPosition: AnchorPosition.BELOW,
			render: container => renderSessionHeaderEditor(container, { ...options, close: () => this.close() }, this.instantiationService),
			onHide: () => {
				options.anchor.focus();
				if (this.open.value === session) {
					this.open.clear();
				}
			},
		});
		session.add(toDisposable(() => view.close()));
		session.add(toDisposable(() => this.setOpened(false)));
	}

	showCollectionEditor(options: ISessionCollectionEditorOptions): void {
		const collection = options.collectionId ? this.collectionsService.getCollection(options.collectionId) : this.collectionsService.createCollection();
		if (!collection) {
			options.onDidClose?.();
			return;
		}

		const session = new DisposableStore();
		this.open.value = session;
		this.setOpened(true);

		const restoreFocus = () => {
			if (DOM.isHTMLElement(options.anchor)) {
				options.anchor.focus();
			}
		};
		const view = this.contextViewService.showContextView({
			getAnchor: () => options.anchor,
			anchorAlignment: AnchorAlignment.LEFT,
			anchorPosition: AnchorPosition.BELOW,
			render: container => this.instantiationService.createInstance(SessionCollectionEditorBody, container, { ...options, collectionId: collection.id, close: () => this.close(), isNew: !options.collectionId }),
			onHide: () => {
				restoreFocus();
				if (this.open.value === session) {
					this.open.clear();
				}
			},
		});
		session.add(toDisposable(() => view.close()));
		session.add(toDisposable(() => this.setOpened(false)));
	}

	close(): void {
		this.open.clear();
	}

	private setOpened(value: boolean): void {
		if (this.opened === value) {
			return;
		}
		this.opened = value;
		this.onDidChangeOpenEmitter.fire(value);
	}
}

/** Renders the header editor body into a container without a context view; used by the popover and by fixtures. Returns a disposable. */
export function renderSessionHeaderEditor(container: HTMLElement, options: Omit<ISessionHeaderEditorOptions, 'anchor'> & { readonly close: () => void }, instantiationService: IInstantiationService): IDisposable {
	return instantiationService.createInstance(SessionHeaderEditorBody, container, options);
}

export function renderSessionCollectionEditor(container: HTMLElement, options: Omit<ISessionCollectionEditorOptions, 'anchor'> & { readonly collectionId: string; readonly close: () => void }, instantiationService: IInstantiationService): IDisposable {
	return instantiationService.createInstance(SessionCollectionEditorBody, container, { ...options, isNew: false });
}

interface ISessionCollectionEditorBodyOptions extends Omit<ISessionCollectionEditorOptions, 'anchor'> {
	readonly collectionId: string;
	readonly close: () => void;
	readonly isNew: boolean;
}

interface ISessionColorSwatchOptions {
	readonly allowCustom: boolean;
	readonly ariaLabel: string;
	readonly onDidPick: (color: SessionColor) => void;
	readonly onDidRequestCustom?: () => void;
}

class SessionColorSwatches extends Disposable {

	readonly domNode: HTMLElement;
	private readonly swatches: { readonly element: HTMLButtonElement; readonly color?: SessionColor }[] = [];

	constructor(container: HTMLElement, private readonly options: ISessionColorSwatchOptions, @IHoverService hoverService: IHoverService, @IThemeService private readonly themeService: IThemeService) {
		super();
		this.domNode = DOM.append(container, $('.session-header-editor-swatches', { role: 'radiogroup', 'aria-label': options.ariaLabel }));
		for (const color of SESSION_PALETTE_COLORS) {
			const element = DOM.append(this.domNode, $<HTMLButtonElement>('button.session-header-editor-swatch', { role: 'radio', 'aria-label': getSessionPaletteColorLabel(color), type: 'button' }));
			DOM.append(element, $(`span.session-header-editor-swatch-check${ThemeIcon.asCSSSelector(Codicon.check)}`, { 'aria-hidden': 'true' }));
			this._register(hoverService.setupDelayedHover(element, { content: getSessionPaletteColorLabel(color) }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => options.onDidPick(color)));
			this.swatches.push({ element, color });
		}
		if (options.allowCustom) {
			const customLabel = localize('sessionHeaderEditor.customColor', "Custom Color");
			const element = DOM.append(this.domNode, $<HTMLButtonElement>('button.session-header-editor-swatch.session-header-editor-swatch-custom', { role: 'radio', 'aria-label': customLabel, 'aria-expanded': 'false', type: 'button' }));
			DOM.append(element, $(`span${ThemeIcon.asCSSSelector(Codicon.symbolColor)}`, { 'aria-hidden': 'true' }));
			this._register(hoverService.setupDelayedHover(element, { content: localize('sessionHeaderEditor.customColorHover', "Custom Color...") }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => options.onDidRequestCustom?.()));
			this.swatches.push({ element });
		}
		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, e => this.onKeyDown(e)));
		this._register(themeService.onDidColorThemeChange(() => this.updatePaletteStyles()));
		this.updatePaletteStyles();
	}

	setCustomExpanded(expanded: boolean): void {
		const custom = this.swatches.find(swatch => !swatch.color);
		custom?.element.setAttribute('aria-expanded', String(expanded));
		custom?.element.classList.toggle('expanded', expanded);
	}

	setSelected(color: SessionColor): void {
		for (const swatch of this.swatches) {
			const checked = swatch.color ? swatch.color === color : !isSessionPaletteColor(color);
			swatch.element.classList.toggle('checked', checked);
			swatch.element.setAttribute('aria-checked', String(checked));
			swatch.element.tabIndex = checked ? 0 : -1;
			if (!swatch.color) {
				this.updateCustomSwatch(swatch.element, color);
			}
		}
	}

	focusSelected(): void {
		(this.swatches.find(swatch => swatch.element.classList.contains('checked')) ?? this.swatches[0])?.element.focus();
	}

	private onKeyDown(e: KeyboardEvent): void {
		const event = new StandardKeyboardEvent(e);
		const activeIndex = Math.max(0, this.swatches.findIndex(swatch => swatch.element === DOM.getActiveElement()));
		let nextIndex: number | undefined;
		if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
			nextIndex = (activeIndex + 1) % this.swatches.length;
		} else if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
			nextIndex = (activeIndex - 1 + this.swatches.length) % this.swatches.length;
		} else if (event.equals(KeyCode.Home)) {
			nextIndex = 0;
		} else if (event.equals(KeyCode.End)) {
			nextIndex = this.swatches.length - 1;
		}
		if (nextIndex === undefined) {
			return;
		}
		event.preventDefault();
		const next = this.swatches[nextIndex];
		next.element.focus();
		if (next.color) {
			this.options.onDidPick(next.color);
		} else {
			this.options.onDidRequestCustom?.();
		}
	}

	private updatePaletteStyles(): void {
		for (const swatch of this.swatches) {
			if (!swatch.color || !isSessionPaletteColor(swatch.color)) {
				continue;
			}
			const resolved = resolveSessionColor(swatch.color, SessionTextColorMode.Auto, this.themeService.getColorTheme());
			swatch.element.style.setProperty('--session-header-editor-fill', asCssVariable(sessionPaletteColorIds[swatch.color]));
			swatch.element.style.setProperty('--session-header-editor-text', resolved.textCss);
		}
	}

	private updateCustomSwatch(element: HTMLElement, color: SessionColor): void {
		if (isSessionPaletteColor(color)) {
			element.style.removeProperty('--session-header-editor-fill');
			element.style.removeProperty('--session-header-editor-text');
			return;
		}
		const resolved = resolveSessionColor(color, SessionTextColorMode.Auto, this.themeService.getColorTheme());
		element.style.setProperty('--session-header-editor-fill', resolved.fillCss);
		element.style.setProperty('--session-header-editor-text', resolved.textCss);
	}
}

class SessionHeaderEditorBody extends Disposable {

	private readonly root: HTMLElement;
	private readonly initialName: string | undefined;
	private readonly initialColor: ISessionSectionColor | undefined;
	private suppressCloseCommit = false;
	private disposed = false;

	constructor(
		container: HTMLElement,
		private readonly options: Omit<ISessionHeaderEditorOptions, 'anchor'> & { readonly close: () => void },
		@IThemeService private readonly themeService: IThemeService,
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@ISessionSectionColorsService private readonly sectionColorsService: ISessionSectionColorsService,
		@ISessionCollectionsService private readonly collectionsService: ISessionCollectionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.initialName = this.getGroupName();
		this.initialColor = this.sectionColorsService.getColor(options.target.sectionId);
		this.ensureInitialColor();
		this.root = DOM.append(container, $(`.session-header-editor`, { role: 'dialog', 'aria-label': this.getDialogLabel() }));
		this.render();
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.commit();
			this.options.onDidClose?.();
		}
		super.dispose();
	}

	private render(): void {
		this._register(DOM.addDisposableListener(DOM.getWindow(this.root), DOM.EventType.KEY_DOWN, e => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.options.close();
			}
		}, true));

		const nameInput = this.renderNameOrTitle();
		DOM.append(this.root, $('.session-header-editor-label', undefined, localize('sessionHeaderEditor.color', "Color")));

		let setCustomExpanded: (expanded: boolean) => void = () => { };
		const swatches = this._register(this.instantiationService.createInstance(SessionColorSwatches, this.root, {
			allowCustom: true,
			ariaLabel: localize('sessionHeaderEditor.colorAria', "Color"),
			onDidPick: color => {
				this.writeColor(color);
				setCustomExpanded(false);
			},
			onDidRequestCustom: () => setCustomExpanded(!customSection.classList.contains('visible')),
		}));

		const customSection = DOM.append(this.root, $('.session-header-editor-custom'));
		const pickerContainer = DOM.append(customSection, $('.session-header-editor-picker'));
		const hexRow = DOM.append(customSection, $('.session-header-editor-hex'));
		DOM.append(hexRow, $('span.session-header-editor-label', undefined, localize('sessionHeaderEditor.hex', "Hex")));
		const hexInput = this._register(new InputBox(hexRow, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('sessionHeaderEditor.hexColor', "Hex color"),
			validationOptions: {
				validation: value => isValidHexColor(value) ? null : { content: localize('sessionHeaderEditor.hexValidation', "Use #rgb or #rrggbb") },
			},
		}));
		let syncingPicker = false;
		let pickerModel: ColorPickerModel | undefined;
		let pickerHost: ColorPickerWidget | undefined;
		const pickerStore = this._register(new MutableDisposable<DisposableStore>());
		const ensurePicker = () => {
			if (pickerModel && pickerHost) {
				return;
			}
			const store = new DisposableStore();
			pickerStore.value = store;
			pickerModel = store.add(new ColorPickerModel(Color.fromHex(this.getCurrentFill() ?? '#7f7f7f'), [{ label: '' }], 0));
			pickerHost = store.add(new ColorPickerWidget(pickerContainer, pickerModel, DOM.getWindow(this.root).devicePixelRatio, this.themeService, ColorPickerWidgetType.Hover));
			store.add(pickerModel.onDidChangeColor(color => {
				if (!syncingPicker) {
					const normalized = normalizeHexColor(Color.Format.CSS.formatHex(color));
					if (normalized) {
						this.writeColor(normalized);
					}
				}
			}));
		};
		const syncPicker = (fill: string) => {
			syncingPicker = true;
			if (pickerModel) {
				pickerModel.color = Color.fromHex(fill);
			}
			if (hexInput.value.toLowerCase() !== fill && !DOM.isAncestorOfActiveElement(hexRow)) {
				hexInput.value = fill;
			}
			syncingPicker = false;
		};
		setCustomExpanded = expanded => {
			if (expanded === customSection.classList.contains('visible')) {
				return;
			}
			customSection.classList.toggle('visible', expanded);
			swatches.setCustomExpanded(expanded);
			if (expanded) {
				ensurePicker();
				syncPicker(this.getCurrentFill() ?? '#7f7f7f');
				pickerHost?.layout();
			}
		};
		this._register(hexInput.onDidChange(value => {
			if (isValidHexColor(value) && !syncingPicker) {
				const normalized = normalizeHexColor(value);
				if (normalized) {
					this.writeColor(normalized);
				}
			}
		}));

		const textRow = DOM.append(this.root, $('.session-header-editor-row.session-header-editor-text'));
		DOM.append(textRow, $('span.session-header-editor-label', undefined, localize('sessionHeaderEditor.text', "Text")));
		const textRadio = this._register(new Radio({
			items: TEXT_COLOR_MODES.map(mode => ({ text: getTextColorModeLabel(mode) })),
			className: 'segmented',
			ariaLabel: localize('sessionHeaderEditor.textColor', "Text color"),
		}));
		textRow.appendChild(textRadio.domNode);
		this._register(textRadio.onDidSelect(index => this.writeTextColor(TEXT_COLOR_MODES[index])));

		const preview = DOM.append(this.root, $('.session-header-editor-preview'));
		const previewPill = DOM.append(preview, $('span.session-header-editor-preview-pill'));
		DOM.append(previewPill, $(`span${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`, { 'aria-hidden': 'true' }));
		const previewLabel = DOM.append(previewPill, $('span.session-header-editor-preview-label'));
		this._register(this.hoverService.setupDelayedHover(previewLabel, { content: this.getCurrentLabel() }));
		const contrast = DOM.append(preview, $('span.session-header-editor-contrast'));
		const contrastText = DOM.append(contrast, $('span'));

		this.renderMoveTargets();
		this.renderActions();

		const update = () => {
			const color = this.getCurrentColor();
			if (!color) {
				return;
			}
			const resolved = resolveSessionColor(color.color, color.textColor, this.themeService.getColorTheme());
			swatches.setSelected(color.color);
			textRadio.setActiveItem(TEXT_COLOR_MODES.indexOf(color.textColor));
			previewPill.style.setProperty('--session-header-editor-fill', resolved.fillCss);
			previewPill.style.setProperty('--session-header-editor-text', resolved.textCss);
			previewLabel.textContent = this.getCurrentLabel();
			contrastText.textContent = localize('sessionHeaderEditor.contrast', "{0} · {1}", getTextColorModeLabel(color.textColor), formatContrastRatio(resolved.contrast));
			contrast.classList.toggle('warning', resolved.contrast < 4.5);
			if (!isSessionPaletteColor(color.color) && customSection.classList.contains('visible')) {
				syncPicker(resolved.fillCss);
			}
		};
		this._register(autorun(reader => {
			this.sectionColorsService.colors.read(reader);
			update();
		}));
		this._register(this.groupsService.onDidChange(() => update()));
		this._register(this.themeService.onDidColorThemeChange(() => update()));

		const targetWindow = DOM.getWindow(this.root);
		const frame = targetWindow.requestAnimationFrame(() => {
			if (nameInput) {
				nameInput.focus();
				nameInput.select();
			} else {
				swatches.focusSelected();
			}
		});
		this._register(toDisposable(() => targetWindow.cancelAnimationFrame(frame)));
	}

	private renderNameOrTitle(): InputBox | undefined {
		const row = DOM.append(this.root, $('.session-header-editor-row'));
		if (this.options.target.kind === 'group' && this.options.target.groupId) {
			const input = this._register(new InputBox(row, undefined, {
				inputBoxStyles: defaultInputBoxStyles,
				ariaLabel: localize('sessionHeaderEditor.groupName', "Group name"),
				placeholder: localize('sessionHeaderEditor.groupNamePlaceholder', "Name this group"),
			}));
			input.value = this.getCurrentLabel();
			this._register(input.onDidChange(value => {
				const trimmed = value.trim();
				if (trimmed && this.options.target.groupId) {
					this.groupsService.renameGroup(this.options.target.groupId, trimmed);
				}
			}));
			this._register(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, e => {
				if (e.equals(KeyCode.Enter)) {
					e.preventDefault();
					this.options.close();
				}
			}));
			return input;
		}

		const title = DOM.append(row, $('.session-header-editor-title'));
		DOM.append(title, $(`span${ThemeIcon.asCSSSelector(this.options.target.icon ?? Codicon.folder)}`, { 'aria-hidden': 'true' }));
		const label = DOM.append(title, $('span.session-header-editor-title-label', undefined, this.options.target.label));
		this._register(this.hoverService.setupDelayedHover(label, { content: this.options.target.label }));
		return undefined;
	}

	private renderMoveTargets(): void {
		if (!this.configurationService.getValue<boolean>(SESSIONS_LIST_COLLECTIONS_SETTING) || this.options.target.kind === 'section') {
			return;
		}
		const collections = this.collectionsService.collections.get();
		if (collections.length <= 1) {
			return;
		}
		const currentCollectionId = this.options.target.kind === 'group' && this.options.target.groupId
			? this.collectionsService.getGroupCollection(this.options.target.groupId)
			: this.collectionsService.getWorkspaceCollection(this.options.target.sectionId);
		const targets = collections.filter(collection => collection.id !== currentCollectionId);
		if (!targets.length) {
			return;
		}
		const row = DOM.append(this.root, $('.session-header-editor-row.session-header-editor-move'));
		DOM.append(row, $('span.session-header-editor-label', undefined, localize('sessionHeaderEditor.moveTo', "Move to")));
		const chips = DOM.append(row, $('.session-header-editor-chips'));
		for (const collection of targets) {
			const chip = DOM.append(chips, $('button.session-header-editor-chip', { type: 'button', 'aria-label': localize('sessionHeaderEditor.moveToAria', "Move to {0}", collection.name) }));
			chip.style.setProperty('--session-header-editor-accent', resolveSessionColor(collection.color, SessionTextColorMode.Auto, this.themeService.getColorTheme()).fillCss);
			renderCollectionIcon(DOM.append(chip, $('span.session-header-editor-chip-icon')), collection.icon);
			const label = DOM.append(chip, $('span.session-header-editor-chip-label', undefined, collection.name));
			this._register(this.hoverService.setupDelayedHover(label, { content: collection.name }));
			this._register(DOM.addDisposableListener(chip, DOM.EventType.CLICK, () => this.moveToCollection(collection)));
		}
	}

	private renderActions(): void {
		if (!this.options.actions?.length) {
			return;
		}
		DOM.append(this.root, $('.session-header-editor-separator'));
		const actions = DOM.append(this.root, $('.session-header-editor-actions'));
		for (const action of this.options.actions) {
			const button = DOM.append(actions, $<HTMLButtonElement>('button.session-header-editor-action', { type: 'button', title: action.tooltip || action.label, 'aria-label': action.label }, action.label));
			button.disabled = !action.enabled;
			this._register(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => {
				this.options.close();
				void runAction(action);
			}));
		}
	}

	private moveToCollection(collection: ISessionCollection): void {
		let undo: (() => void) | undefined;
		if (this.options.target.kind === 'group' && this.options.target.groupId) {
			undo = this.collectionsService.moveGroupToCollection(this.options.target.groupId, collection.id);
		} else if (this.options.target.kind === 'workspace') {
			undo = this.collectionsService.moveWorkspaceToCollection(this.options.target.sectionId, collection.id, this.options.target.sessions ?? []);
		}
		if (!undo) {
			return;
		}
		this.suppressCloseCommit = true;
		this.options.close();
		this.options.onDidCommit?.(localize('sessionHeaderEditor.movedToCollection', "Moved '{0}' to {1}", this.getCurrentLabel(), collection.name), undo);
	}

	private ensureInitialColor(): void {
		if (this.initialColor) {
			return;
		}
		this.sectionColorsService.setColor(this.options.target.sectionId, { color: this.sectionColorsService.getNextColor(), textColor: SessionTextColorMode.Auto });
	}

	private getCurrentColor(): ISessionSectionColor | undefined {
		return this.sectionColorsService.getColor(this.options.target.sectionId);
	}

	private writeColor(color: SessionColor): void {
		const current = this.getCurrentColor();
		this.sectionColorsService.setColor(this.options.target.sectionId, { color, textColor: current?.textColor ?? SessionTextColorMode.Auto });
	}

	private writeTextColor(textColor: SessionTextColorMode): void {
		const current = this.getCurrentColor();
		this.sectionColorsService.setColor(this.options.target.sectionId, { color: current?.color ?? this.sectionColorsService.getNextColor(), textColor });
	}

	private getCurrentFill(): string | undefined {
		const color = this.getCurrentColor();
		return color ? resolveSessionColor(color.color, color.textColor, this.themeService.getColorTheme()).fillCss : undefined;
	}

	private getCurrentLabel(): string {
		return this.getGroupName() ?? this.options.target.label;
	}

	private getGroupName(): string | undefined {
		return this.options.target.groupId ? this.groupsService.getGroup(this.options.target.groupId)?.name : undefined;
	}

	private getDialogLabel(): string {
		switch (this.options.target.kind) {
			case 'group': return localize('sessionHeaderEditor.editGroup', "Edit Group");
			case 'workspace': return localize('sessionHeaderEditor.colorWorkspace', "Color Workspace");
			case 'section': return localize('sessionHeaderEditor.colorSection', "Color Section");
		}
	}

	private commit(): void {
		if (this.suppressCloseCommit) {
			return;
		}
		if (!this.hasChanged()) {
			return;
		}
		const target = this.options.target;
		const groupId = target.groupId;
		const initialName = this.initialName;
		const initialColor = this.initialColor;
		const sectionId = target.sectionId;
		const undo = () => {
			if (groupId && initialName !== undefined) {
				this.groupsService.renameGroup(groupId, initialName);
			}
			this.sectionColorsService.setColor(sectionId, initialColor);
		};
		this.options.onDidCommit?.(this.getCommitMessage(), undo);
	}

	private hasChanged(): boolean {
		return this.initialName !== this.getGroupName() || !sectionColorEquals(this.initialColor, this.getCurrentColor());
	}

	private getCommitMessage(): string {
		const label = this.getCurrentLabel();
		switch (this.options.target.kind) {
			case 'group': return localize('sessionHeaderEditor.editedGroup', "Edited group '{0}'", label);
			case 'workspace': return localize('sessionHeaderEditor.editedWorkspace', "Edited workspace '{0}'", label);
			case 'section': return localize('sessionHeaderEditor.editedSection', "Edited section '{0}'", label);
		}
	}
}

class SessionCollectionEditorBody extends Disposable {

	private readonly root: HTMLElement;
	private readonly initialCollection: ISessionCollection | undefined;
	private readonly initialIndex: number;
	private suppressCloseCommit = false;
	private disposed = false;

	constructor(
		container: HTMLElement,
		private readonly options: ISessionCollectionEditorBodyOptions,
		@IThemeService private readonly themeService: IThemeService,
		@IHoverService private readonly hoverService: IHoverService,
		@ISessionCollectionsService private readonly collectionsService: ISessionCollectionsService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		const collections = this.collectionsService.collections.get();
		this.initialCollection = this.collectionsService.getCollection(options.collectionId);
		this.initialIndex = collections.findIndex(collection => collection.id === options.collectionId);
		this.root = DOM.append(container, $('.session-collection-editor', { role: 'dialog', 'aria-label': options.isNew ? localize('sessionCollectionEditor.newCollection', "New Collection") : localize('sessionCollectionEditor.editCollection', "Edit Collection") }));
		this.render();
	}

	override dispose(): void {
		if (!this.disposed) {
			this.disposed = true;
			this.commit();
			this.options.onDidClose?.();
		}
		super.dispose();
	}

	private render(): void {
		this._register(DOM.addDisposableListener(DOM.getWindow(this.root), DOM.EventType.KEY_DOWN, e => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.options.close();
			}
		}, true));

		DOM.append(this.root, $('.session-header-editor-title', undefined, this.options.isNew ? localize('sessionCollectionEditor.newHeading', "New collection") : localize('sessionCollectionEditor.heading', "Collection")));
		const nameRow = DOM.append(this.root, $('.session-header-editor-row'));
		const nameInput = this._register(new InputBox(nameRow, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: localize('sessionCollectionEditor.collectionName', "Collection name"),
			placeholder: localize('sessionCollectionEditor.collectionNamePlaceholder', "Name this collection"),
		}));
		nameInput.value = this.getCollection()?.name ?? '';
		this._register(nameInput.onDidChange(value => {
			const name = value.trim();
			if (name) {
				this.collectionsService.updateCollection(this.options.collectionId, { name });
			}
		}));
		this._register(DOM.addStandardDisposableListener(nameInput.inputElement, DOM.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter)) {
				e.preventDefault();
				this.options.close();
			}
		}));

		DOM.append(this.root, $('.session-header-editor-label', undefined, localize('sessionCollectionEditor.icon', "Icon")));
		const iconGrid = DOM.append(this.root, $('.session-collection-editor-icon-grid', { role: 'radiogroup', 'aria-label': localize('sessionCollectionEditor.iconAria', "Icon") }));
		const iconButtons = this.renderIconButtons(iconGrid);

		DOM.append(this.root, $('.session-header-editor-label', undefined, localize('sessionCollectionEditor.color', "Color")));
		const swatches = this._register(this.instantiationService.createInstance(SessionColorSwatches, this.root, {
			allowCustom: false,
			ariaLabel: localize('sessionCollectionEditor.colorAria', "Collection color"),
			onDidPick: color => {
				if (isSessionPaletteColor(color)) {
					this.collectionsService.updateCollection(this.options.collectionId, { color });
				}
			},
		}));

		const stats = DOM.append(this.root, $('.session-collection-editor-stats'));
		DOM.append(this.root, $('.session-header-editor-separator'));
		const actions = DOM.append(this.root, $('.session-header-editor-actions'));
		const moveLeft = DOM.append(actions, $<HTMLButtonElement>('button.session-header-editor-action', { type: 'button', 'aria-label': localize('sessionCollectionEditor.moveLeft', "Move Left") }, localize('sessionCollectionEditor.moveLeft', "Move Left")));
		this._register(DOM.addDisposableListener(moveLeft, DOM.EventType.CLICK, () => this.moveCollection(-1)));
		const moveRight = DOM.append(actions, $<HTMLButtonElement>('button.session-header-editor-action', { type: 'button', 'aria-label': localize('sessionCollectionEditor.moveRight', "Move Right") }, localize('sessionCollectionEditor.moveRight', "Move Right")));
		this._register(DOM.addDisposableListener(moveRight, DOM.EventType.CLICK, () => this.moveCollection(1)));
		const deleteButton = DOM.append(actions, $<HTMLButtonElement>('button.session-header-editor-action', { type: 'button', 'aria-label': localize('sessionCollectionEditor.deleteCollection', "Delete Collection") }, localize('sessionCollectionEditor.deleteCollection', "Delete Collection")));

		const deleteTargets = DOM.append(this.root, $('.session-collection-editor-delete-targets'));
		DOM.append(deleteTargets, $('span.session-header-editor-label', undefined, localize('sessionCollectionEditor.moveContentsTo', "Move contents to:")));
		const deleteChips = DOM.append(deleteTargets, $('.session-header-editor-chips'));
		this.renderDeleteTargets(deleteChips);
		this._register(DOM.addDisposableListener(deleteButton, DOM.EventType.CLICK, () => deleteTargets.classList.add('visible')));

		const update = () => {
			const collection = this.getCollection();
			if (!collection) {
				return;
			}
			swatches.setSelected(collection.color);
			const accent = resolveSessionColor(collection.color, SessionTextColorMode.Auto, this.themeService.getColorTheme()).fillCss;
			for (const { icon, element } of iconButtons) {
				const checked = collection.icon === icon;
				element.classList.toggle('checked', checked);
				element.setAttribute('aria-checked', String(checked));
				element.tabIndex = checked ? 0 : -1;
				element.style.setProperty('--session-header-editor-accent', checked ? accent : '');
			}
			const collections = this.collectionsService.collections.get();
			const index = collections.findIndex(candidate => candidate.id === collection.id);
			moveLeft.disabled = index <= 0;
			moveRight.disabled = index === -1 || index >= collections.length - 1;
			deleteButton.disabled = collections.length <= 1;
			stats.textContent = localize('sessionCollectionEditor.stats', "{0} groups · {1} sessions", this.getGroupCount(), this.getSessionCount());
		};
		this._register(autorun(reader => {
			this.collectionsService.collections.read(reader);
			update();
		}));
		this._register(this.themeService.onDidColorThemeChange(() => update()));

		const targetWindow = DOM.getWindow(this.root);
		const frame = targetWindow.requestAnimationFrame(() => {
			nameInput.focus();
			nameInput.select();
		});
		this._register(toDisposable(() => targetWindow.cancelAnimationFrame(frame)));
	}

	private renderIconButtons(iconGrid: HTMLElement): { readonly icon: string; readonly element: HTMLButtonElement }[] {
		const buttons: { readonly icon: string; readonly element: HTMLButtonElement }[] = [];
		for (const icon of SESSION_COLLECTION_ICONS) {
			const label = getCollectionIconLabel(icon);
			const element = DOM.append(iconGrid, $<HTMLButtonElement>('button.session-collection-editor-icon-choice', { role: 'radio', type: 'button', 'aria-label': label }));
			renderCollectionIcon(element, icon);
			this._register(this.hoverService.setupDelayedHover(element, { content: label }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => this.collectionsService.updateCollection(this.options.collectionId, { icon })));
			buttons.push({ icon, element });
		}
		this._register(DOM.addDisposableListener(iconGrid, DOM.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			const delta = event.equals(KeyCode.RightArrow) ? 1 : event.equals(KeyCode.LeftArrow) ? -1 : event.equals(KeyCode.DownArrow) ? 8 : event.equals(KeyCode.UpArrow) ? -8 : 0;
			if (!delta) {
				return;
			}
			event.preventDefault();
			const index = Math.max(0, buttons.findIndex(button => button.element === DOM.getActiveElement()));
			const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))];
			next.element.focus();
			next.element.click();
		}));
		return buttons;
	}

	private renderDeleteTargets(container: HTMLElement): void {
		for (const collection of this.collectionsService.collections.get().filter(collection => collection.id !== this.options.collectionId)) {
			const chip = DOM.append(container, $('button.session-header-editor-chip', { type: 'button', 'aria-label': localize('sessionCollectionEditor.moveContentsToAria', "Move contents to {0}", collection.name) }));
			chip.style.setProperty('--session-header-editor-accent', resolveSessionColor(collection.color, SessionTextColorMode.Auto, this.themeService.getColorTheme()).fillCss);
			renderCollectionIcon(DOM.append(chip, $('span.session-header-editor-chip-icon')), collection.icon);
			DOM.append(chip, $('span.session-header-editor-chip-label', undefined, collection.name));
			this._register(DOM.addDisposableListener(chip, DOM.EventType.CLICK, () => this.deleteCollection(collection.id)));
		}
	}

	private moveCollection(delta: number): void {
		const collections = this.collectionsService.collections.get();
		const index = collections.findIndex(collection => collection.id === this.options.collectionId);
		if (index !== -1) {
			this.collectionsService.moveCollection(this.options.collectionId, index + delta);
		}
	}

	private deleteCollection(moveToId: string): void {
		const name = this.getCollection()?.name ?? '';
		const undo = this.collectionsService.deleteCollection(this.options.collectionId, moveToId);
		if (!undo) {
			return;
		}
		this.suppressCloseCommit = true;
		this.options.onDidCommit?.(localize('sessionCollectionEditor.deletedCollection', "Deleted collection '{0}'", name), undo);
		this.options.close();
	}

	private commit(): void {
		if (this.suppressCloseCommit) {
			return;
		}
		if (this.options.isNew) {
			const collection = this.getCollection();
			if (!collection) {
				return;
			}
			this.options.onDidCommit?.(localize('sessionCollectionEditor.createdCollection', "Created collection '{0}'", collection.name), () => this.deleteCreatedCollection(collection.id));
			return;
		}
		if (!this.hasChanged()) {
			return;
		}
		const initial = this.initialCollection;
		const initialIndex = this.initialIndex;
		if (!initial) {
			return;
		}
		this.options.onDidCommit?.(localize('sessionCollectionEditor.editedCollection', "Edited collection '{0}'", this.getCollection()?.name ?? initial.name), () => {
			if (this.collectionsService.getCollection(initial.id)) {
				this.collectionsService.updateCollection(initial.id, { name: initial.name, icon: initial.icon, color: initial.color });
				this.collectionsService.moveCollection(initial.id, initialIndex);
			}
		});
	}

	private hasChanged(): boolean {
		const current = this.getCollection();
		if (!this.initialCollection || !current) {
			return false;
		}
		const index = this.collectionsService.collections.get().findIndex(collection => collection.id === current.id);
		return current.name !== this.initialCollection.name || current.icon !== this.initialCollection.icon || current.color !== this.initialCollection.color || index !== this.initialIndex;
	}

	private deleteCreatedCollection(collectionId: string): void {
		const collections = this.collectionsService.collections.get();
		const moveToId = this.collectionsService.defaultCollectionId.get() !== collectionId
			? this.collectionsService.defaultCollectionId.get()
			: collections.find(collection => collection.id !== collectionId)?.id;
		if (moveToId) {
			this.collectionsService.deleteCollection(collectionId, moveToId);
		}
	}

	private getCollection(): ISessionCollection | undefined {
		return this.collectionsService.getCollection(this.options.collectionId);
	}

	private getGroupCount(): number {
		return this.groupsService.getGroups().filter(group => this.collectionsService.getGroupCollection(group.id) === this.options.collectionId).length;
	}

	private getSessionCount(): number {
		return this.sessionsManagementService.getSessions().filter(session => this.collectionsService.getSessionCollection(session) === this.options.collectionId).length;
	}
}

function renderCollectionIcon(container: HTMLElement, icon: string): void {
	DOM.clearNode(container);
	DOM.append(container, $(`span${ThemeIcon.asCSSSelector(ThemeIcon.fromId(icon))}`, { 'aria-hidden': 'true' }));
}

function getTextColorModeLabel(mode: SessionTextColorMode): string {
	switch (mode) {
		case SessionTextColorMode.Auto: return localize('sessionHeaderEditor.textAuto', "Auto");
		case SessionTextColorMode.Light: return localize('sessionHeaderEditor.textLight', "Light");
		case SessionTextColorMode.Dark: return localize('sessionHeaderEditor.textDark', "Dark");
	}
}

function sectionColorEquals(a: ISessionSectionColor | undefined, b: ISessionSectionColor | undefined): boolean {
	return a?.color === b?.color && a?.textColor === b?.textColor;
}

async function runAction(action: IAction): Promise<void> {
	try {
		await action.run();
	} catch (error) {
		onUnexpectedError(error);
	}
}

function getCollectionIconLabel(icon: string): string {
	switch (icon) {
		case Codicon.layers.id: return localize('sessionCollectionIcon.layers', "Layers");
		case Codicon.graph.id: return localize('sessionCollectionIcon.graph', "Graph");
		case Codicon.briefcase.id: return localize('sessionCollectionIcon.briefcase', "Briefcase");
		case Codicon.home.id: return localize('sessionCollectionIcon.home', "Home");
		case Codicon.person.id: return localize('sessionCollectionIcon.person', "Person");
		case Codicon.heart.id: return localize('sessionCollectionIcon.heart', "Heart");
		case Codicon.rocket.id: return localize('sessionCollectionIcon.rocket', "Rocket");
		case Codicon.beaker.id: return localize('sessionCollectionIcon.beaker', "Beaker");
		case Codicon.book.id: return localize('sessionCollectionIcon.book', "Book");
		case Codicon.bug.id: return localize('sessionCollectionIcon.bug', "Bug");
		case Codicon.coffee.id: return localize('sessionCollectionIcon.coffee', "Coffee");
		case Codicon.star.id: return localize('sessionCollectionIcon.star', "Star");
		case Codicon.target.id: return localize('sessionCollectionIcon.target', "Target");
		case Codicon.tools.id: return localize('sessionCollectionIcon.tools', "Tools");
		case Codicon.zap.id: return localize('sessionCollectionIcon.zap', "Zap");
		case Codicon.lightbulb.id: return localize('sessionCollectionIcon.lightbulb', "Lightbulb");
		case Codicon.inbox.id: return localize('sessionCollectionIcon.inbox', "Inbox");
		case Codicon.globe.id: return localize('sessionCollectionIcon.globe', "Globe");
		case Codicon.library.id: return localize('sessionCollectionIcon.library', "Library");
		case Codicon.mortarBoard.id: return localize('sessionCollectionIcon.mortarBoard', "Mortar Board");
		case Codicon.organization.id: return localize('sessionCollectionIcon.organization', "Organization");
		case Codicon.package.id: return localize('sessionCollectionIcon.package', "Package");
		case Codicon.flame.id: return localize('sessionCollectionIcon.flame', "Flame");
		case Codicon.telescope.id: return localize('sessionCollectionIcon.telescope', "Telescope");
		default: return icon;
	}
}
