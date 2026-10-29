/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { InputBox } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { Radio } from '../../../../../../base/browser/ui/radio/radio.js';
import { Color } from '../../../../../../base/common/color.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ColorPickerModel } from '../../../../../../editor/contrib/colorPicker/browser/colorPickerModel.js';
import { ColorPickerWidgetType } from '../../../../../../editor/contrib/colorPicker/browser/colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../../../../../../editor/contrib/colorPicker/browser/colorPickerWidget.js';
import { AnchorAlignment, AnchorAxisAlignment } from '../../../../../../base/browser/ui/contextview/contextview.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { defaultInputBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { formatContrast, isValidHex, MockColor, mockColorEquals, MockTextColorMode, MOCK_PALETTE_LABELS, MOCK_PALETTE_ORDER, normalizeHex, paletteValue, resolveMockColor } from './colorGroupsMockupColors.js';
import { BUILT_IN_SECTIONS, ColorGroupsMockModel, getBuiltInSectionStyle, getCollection, getCollectionSessions, getGroup, getWorkspaceStyle, IMockCollection, MockBuiltInSection, MockCollectionIcon } from './colorGroupsMockupModel.js';

const $ = DOM.$;

//#region Collection icons

const COLLECTION_ICON_CHOICES: readonly MockCollectionIcon[] = [
	'graph', 'briefcase', 'home', 'person', 'heart', 'rocket', 'beaker', 'book', 'bug', 'coffee', 'star', 'target', 'tools', 'zap', 'lightbulb', 'inbox',
];

/** Renders a collection icon, which is always a codicon. */
export function renderCollectionIcon(container: HTMLElement, icon: MockCollectionIcon): HTMLElement {
	DOM.clearNode(container);
	return DOM.append(container, $(`span${ThemeIcon.asCSSSelector(ThemeIcon.fromId(icon))}`));
}

export function collectionIconLabel(icon: MockCollectionIcon): string {
	return icon.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

//#endregion

//#region Swatches

interface ISwatchOptions {
	readonly scheme: ColorScheme;
	readonly allowCustom: boolean;
	readonly ariaLabel: string;
	readonly onDidPick: (color: MockColor) => void;
	readonly onDidRequestCustom?: () => void;
}

/** A radio group of palette swatches, following the ARIA radiogroup pattern. */
class ColorSwatches extends Disposable {

	readonly domNode: HTMLElement;
	private readonly swatches: { readonly element: HTMLElement; readonly color?: MockColor }[] = [];

	constructor(container: HTMLElement, private readonly options: ISwatchOptions, hoverService: IHoverService) {
		super();
		this.domNode = DOM.append(container, $('.cg-swatches', { role: 'radiogroup', 'aria-label': options.ariaLabel }));
		for (const id of MOCK_PALETTE_ORDER) {
			const color: MockColor = { kind: 'palette', id };
			const element = DOM.append(this.domNode, $('button.cg-swatch', { role: 'radio', 'aria-label': MOCK_PALETTE_LABELS[id], type: 'button' }));
			const resolved = resolveMockColor(color, options.scheme);
			element.style.setProperty('--cg-fill', resolved.fill);
			element.style.setProperty('--cg-text', resolved.text);
			DOM.append(element, $(`span.cg-swatch-check${ThemeIcon.asCSSSelector(Codicon.check)}`));
			this._register(hoverService.setupDelayedHover(element, { content: MOCK_PALETTE_LABELS[id] }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => options.onDidPick(color)));
			this.swatches.push({ element, color });
		}
		if (options.allowCustom) {
			const element = DOM.append(this.domNode, $('button.cg-swatch.cg-swatch-custom', { role: 'radio', 'aria-label': 'Custom color', 'aria-expanded': 'false', type: 'button' }));
			DOM.append(element, $(`span${ThemeIcon.asCSSSelector(Codicon.symbolColor)}`));
			this._register(hoverService.setupDelayedHover(element, { content: 'Custom color…' }));
			this._register(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => options.onDidRequestCustom?.()));
			this.swatches.push({ element });
		}
		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const delta = event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow) ? 1 : event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow) ? -1 : 0;
			if (!delta) {
				return;
			}
			event.preventDefault();
			const index = this.swatches.findIndex(s => s.element === DOM.getActiveElement());
			const next = this.swatches[(index + delta + this.swatches.length) % this.swatches.length];
			next.element.focus();
			// Arrowing onto the custom swatch only focuses it; Enter or Space opens the picker.
			if (next.color) {
				next.element.click();
			}
		}));
	}

	setCustomExpanded(expanded: boolean): void {
		const custom = this.swatches.find(s => !s.color);
		custom?.element.setAttribute('aria-expanded', String(expanded));
		custom?.element.classList.toggle('expanded', expanded);
	}

	setSelected(color: MockColor): void {
		for (const swatch of this.swatches) {
			const checked = swatch.color ? mockColorEquals(swatch.color, color) : color.kind === 'custom';
			swatch.element.classList.toggle('checked', checked);
			swatch.element.setAttribute('aria-checked', String(checked));
			swatch.element.tabIndex = checked ? 0 : -1;
			if (!swatch.color) {
				swatch.element.style.setProperty('--cg-fill', color.kind === 'custom' ? normalizeHex(color.hex) : 'transparent');
				swatch.element.style.setProperty('--cg-text', resolveMockColor(color, this.options.scheme).text);
			}
		}
	}

	focusSelected(): void {
		(this.swatches.find(s => s.element.classList.contains('checked')) ?? this.swatches[0]).element.focus();
	}
}

//#endregion

//#region Header editor

/**
 * Popover dismissal shared by the editors: Escape anywhere, or a pointer down
 * outside the popover. Menus opened from inside the popover don't count as outside.
 */
function registerPopoverDismissal(root: HTMLElement, hide: () => void): IDisposable {
	const store = new DisposableStore();
	root.tabIndex = -1;
	const targetWindow = DOM.getWindow(root);
	store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			hide();
		}
	}, true));
	store.add(DOM.addDisposableListener(targetWindow, DOM.EventType.POINTER_DOWN, (e: PointerEvent) => {
		const target = e.target as Node | null;
		if (target && !root.contains(target) && !(target instanceof Element && target.closest('.monaco-menu-container'))) {
			hide();
		}
	}, true));
	return store;
}

export interface IHeaderEditorTarget {
	readonly groupId?: string;
	readonly workspace?: string;
	/** A built-in section (Pinned or Chats); only its color can change. */
	readonly builtIn?: MockBuiltInSection;
	readonly collectionId: string;
}

export interface IHeaderEditorActions {
	newSession(target: IHeaderEditorTarget): void;
	moveToCollection(target: IHeaderEditorTarget, collectionId: string): void;
	ungroup(groupId: string): void;
	closeGroup(groupId: string): void;
	removeWorkspaceColor(workspace: string): void;
	removeSectionColor(section: MockBuiltInSection): void;
}

function contrastGrade(ratio: number): string {
	return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large' : 'Low';
}

/**
 * The browser-style group editor: name, color, readable text color, and
 * group actions. Edits apply live and record a single undo step on close.
 */
export class ColorGroupsHeaderEditor extends Disposable {

	private readonly open = this._register(new MutableDisposable());
	private expandCustom: (() => void) | undefined;

	constructor(
		private readonly model: ColorGroupsMockModel,
		private readonly scheme: ColorScheme,
		private readonly actions: IHeaderEditorActions,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super();
	}

	show(target: IHeaderEditorTarget, anchor: HTMLElement): void {
		const checkpoint = this.model.checkpoint();
		const label = target.groupId ? 'Edited group' : target.builtIn ? 'Edited section color' : 'Edited workspace color';
		const session = new DisposableStore();
		this.open.value = session;
		session.add(toDisposable(() => this.model.commitCheckpoint(label, checkpoint)));

		this.contextViewService.showContextView({
			// Open beside the row so the list stays visible while colors preview live.
			getAnchor: () => anchor.closest<HTMLElement>('.cg-row') ?? anchor,
			anchorAlignment: AnchorAlignment.LEFT,
			anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
			render: container => this.render(container, target, session),
			onHide: () => {
				if (this.open.value === session) {
					this.open.clear();
				}
			},
		});
		session.add(toDisposable(() => this.contextViewService.hideContextView()));
	}

	hide(): void {
		this.open.clear();
	}

	private render(container: HTMLElement, target: IHeaderEditorTarget, session: DisposableStore): IDisposable {
		const store = new DisposableStore();
		const root = DOM.append(container, $('.cg-popover.cg-header-editor', { role: 'dialog', 'aria-label': target.groupId ? 'Edit group' : target.builtIn ? 'Edit section color' : 'Edit workspace color' }));
		const readColor = (): { color: MockColor | undefined; textMode: MockTextColorMode; name: string } => {
			const state = this.model.current;
			if (target.groupId) {
				const group = getGroup(state, target.groupId);
				return { color: group?.color, textMode: group?.textMode ?? MockTextColorMode.Auto, name: group?.name ?? '' };
			}
			if (target.builtIn) {
				const style = getBuiltInSectionStyle(state, target.builtIn);
				return { color: style.color, textMode: style.textMode, name: BUILT_IN_SECTIONS[target.builtIn].label };
			}
			const style = getWorkspaceStyle(state, target.workspace!);
			return { color: style.color, textMode: style.textMode, name: target.workspace! };
		};
		const writeStyle = (patch: { readonly color: MockColor } | { readonly textMode: MockTextColorMode }) => this.model.update(undefined, draft => {
			if (target.groupId) {
				const group = getGroup(draft, target.groupId);
				if (group) {
					Object.assign(group, patch);
				}
			} else if (target.builtIn) {
				draft.builtInSections = { ...draft.builtInSections, [target.builtIn]: { ...getBuiltInSectionStyle(draft, target.builtIn), ...patch } };
			} else {
				draft.workspaces[target.workspace!] = { ...getWorkspaceStyle(draft, target.workspace!), ...patch };
			}
		});
		const writeColor = (color: MockColor) => writeStyle({ color });
		const writeTextMode = (textMode: MockTextColorMode) => writeStyle({ textMode });

		// Name. Only custom groups can be renamed.
		const nameRow = DOM.append(root, $('.cg-editor-row'));
		let nameInput: InputBox | undefined;
		if (target.groupId) {
			nameInput = store.add(new InputBox(nameRow, undefined, { inputBoxStyles: defaultInputBoxStyles, ariaLabel: 'Group name', placeholder: 'Name this group' }));
			nameInput.value = readColor().name;
			store.add(nameInput.onDidChange(value => {
				const trimmed = value.trim();
				if (trimmed) {
					this.model.update(undefined, draft => {
						const group = getGroup(draft, target.groupId!);
						if (group) {
							group.name = trimmed;
						}
					});
				}
			}));
		} else {
			const title = DOM.append(nameRow, $('.cg-editor-title'));
			DOM.append(title, $(`span${ThemeIcon.asCSSSelector(target.builtIn ? BUILT_IN_SECTIONS[target.builtIn].icon : Codicon.folder)}`));
			DOM.append(title, $('span', undefined, readColor().name));
		}

		// Color
		DOM.append(root, $('.cg-editor-label', undefined, 'Color'));
		const swatches = store.add(new ColorSwatches(root, {
			scheme: this.scheme,
			allowCustom: true,
			ariaLabel: 'Color',
			onDidPick: color => {
				writeColor(color);
				setCustomExpanded(false);
			},
			onDidRequestCustom: () => setCustomExpanded(!customSection.classList.contains('visible')),
		}, this.hoverService));

		// Custom color: the editor's color picker plus a hex field, shown on demand from the custom color swatch.
		const customSection = DOM.append(root, $('.cg-editor-custom'));
		const pickerContainer = DOM.append(customSection, $('.cg-editor-picker'));
		const initial = readColor().color;
		const pickerModel = store.add(new ColorPickerModel(Color.fromHex(initial ? resolveMockColor(initial, this.scheme).fill : '#7f7f7f'), [{ label: '' }], 0));
		const pickerHost = store.add(new ColorPickerWidget(pickerContainer, pickerModel, DOM.getWindow(root).devicePixelRatio, this.themeService, ColorPickerWidgetType.Hover));
		const hexRow = DOM.append(customSection, $('.cg-editor-hex'));
		DOM.append(hexRow, $('span.cg-editor-label', undefined, 'Hex'));
		const hexInput = store.add(new InputBox(hexRow, undefined, {
			inputBoxStyles: defaultInputBoxStyles,
			ariaLabel: 'Hex color',
			validationOptions: { validation: value => isValidHex(value) ? null : { content: 'Use #rgb or #rrggbb' } },
		}));
		let syncingPicker = false;
		const syncPicker = (fill: string) => {
			syncingPicker = true;
			pickerModel.color = Color.fromHex(fill);
			if (hexInput.value.toLowerCase() !== fill && !DOM.isAncestorOfActiveElement(hexRow)) {
				hexInput.value = fill;
			}
			syncingPicker = false;
		};
		const setCustomExpanded = (expanded: boolean) => {
			if (expanded === customSection.classList.contains('visible')) {
				return;
			}
			customSection.classList.toggle('visible', expanded);
			swatches.setCustomExpanded(expanded);
			if (expanded) {
				// Start from the current color; it only becomes custom once the picker or hex changes it.
				const current = readColor().color;
				syncPicker(current ? resolveMockColor(current, this.scheme).fill : '#7f7f7f');
				pickerHost.layout();
			}
			this.contextViewService.layout();
		};
		store.add(pickerModel.onDidChangeColor(color => {
			if (!syncingPicker) {
				// Group colors are opaque; formatHex drops the picker's alpha channel.
				writeColor({ kind: 'custom', hex: Color.Format.CSS.formatHex(color) });
			}
		}));
		store.add(hexInput.onDidChange(value => {
			if (isValidHex(value) && !syncingPicker) {
				writeColor({ kind: 'custom', hex: normalizeHex(value) });
			}
		}));

		// Text color
		const textRow = DOM.append(root, $('.cg-editor-row.cg-editor-text'));
		DOM.append(textRow, $('span.cg-editor-label', undefined, 'Text'));
		const textRadio = store.add(new Radio({ items: [{ text: 'Auto' }, { text: 'Light' }, { text: 'Dark' }], className: 'segmented', ariaLabel: 'Text color' }));
		textRow.appendChild(textRadio.domNode);
		const modes = [MockTextColorMode.Auto, MockTextColorMode.Light, MockTextColorMode.Dark];
		store.add(textRadio.onDidSelect(index => writeTextMode(modes[index])));

		// Live preview with contrast readout.
		const preview = DOM.append(root, $('.cg-editor-preview'));
		const previewPill = DOM.append(preview, $('span.cg-preview-pill'));
		DOM.append(previewPill, $(`span${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`));
		const previewLabel = DOM.append(previewPill, $('span.cg-preview-label'));
		const contrast = DOM.append(preview, $('span.cg-editor-contrast'));
		const contrastMode = DOM.append(contrast, $('span'));
		const contrastRatio = DOM.append(contrast, $('span.cg-editor-contrast-ratio'));

		// Move to another collection, as one row of chips. Built-in sections exist in every collection.
		const others = target.builtIn ? [] : this.model.current.collections.filter(c => c.id !== target.collectionId);
		if (others.length) {
			const moveRow = DOM.append(root, $('.cg-editor-row.cg-editor-move'));
			DOM.append(moveRow, $('span.cg-editor-label', undefined, 'Move to'));
			const chips = DOM.append(moveRow, $('.cg-editor-chips'));
			for (const collection of others) {
				const chip = DOM.append(chips, $('button.cg-editor-chip', { type: 'button', 'aria-label': `Move to ${collection.name}` }));
				chip.style.setProperty('--cg-accent', collectionAccent(collection, this.scheme));
				renderCollectionIcon(DOM.append(chip, $('span.cg-editor-chip-icon')), collection.icon);
				DOM.append(chip, $('span', undefined, collection.name));
				store.add(DOM.addDisposableListener(chip, DOM.EventType.CLICK, () => {
					this.hide();
					this.actions.moveToCollection(target, collection.id);
				}));
			}
		}

		// Actions
		DOM.append(root, $('.cg-editor-separator'));
		const actionList = DOM.append(root, $('.cg-editor-actions', { role: 'menu' }));
		const addAction = (icon: ThemeIcon, text: string, run: () => void) => {
			const button = DOM.append(actionList, $('button.cg-editor-action', { role: 'menuitem', type: 'button' }));
			DOM.append(button, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			DOM.append(button, $('span', undefined, text));
			store.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, () => {
				this.hide();
				run();
			}));
		};
		if (target.builtIn !== MockBuiltInSection.Pinned) {
			addAction(Codicon.add, target.groupId ? 'New session in group' : 'New session', () => this.actions.newSession(target));
		}
		if (target.groupId) {
			const groupId = target.groupId;
			addAction(Codicon.ungroupByRefType, 'Ungroup', () => this.actions.ungroup(groupId));
			addAction(Codicon.check, 'Mark group as done', () => this.actions.closeGroup(groupId));
		} else if (target.builtIn) {
			const section = target.builtIn;
			addAction(Codicon.circleSlash, 'Remove color', () => this.actions.removeSectionColor(section));
		} else {
			const workspace = target.workspace!;
			addAction(Codicon.circleSlash, 'Remove color', () => this.actions.removeWorkspaceColor(workspace));
		}

		store.add(autorun(reader => {
			this.model.state.read(reader);
			const { color, textMode, name } = readColor();
			if (!color) {
				return;
			}
			const resolved = resolveMockColor(color, this.scheme, textMode);
			swatches.setSelected(color);
			textRadio.setActiveItem(modes.indexOf(textMode));
			previewPill.style.setProperty('--cg-fill', resolved.fill);
			previewPill.style.setProperty('--cg-text', resolved.text);
			previewLabel.textContent = name || 'Group';
			contrastMode.textContent = `${resolved.textIsLight ? 'Light' : 'Dark'} text${resolved.automatic ? ' · auto' : ''}`;
			contrastRatio.textContent = `${formatContrast(resolved.contrast)} contrast · ${contrastGrade(resolved.contrast)}`;
			contrast.classList.toggle('low', resolved.contrast < 4.5);
			if (color.kind === 'custom') {
				syncPicker(resolved.fill);
			}
		}));

		store.add(registerPopoverDismissal(root, () => this.hide()));
		if (nameInput) {
			const input = nameInput;
			store.add(DOM.addStandardDisposableListener(input.inputElement, DOM.EventType.KEY_DOWN, e => {
				if (e.equals(KeyCode.Enter)) {
					e.preventDefault();
					this.hide();
				}
			}));
		}

		this.expandCustom = () => setCustomExpanded(true);
		store.add(toDisposable(() => this.expandCustom = undefined));
		DOM.getWindow(root).requestAnimationFrame(() => {
			if (nameInput) {
				nameInput.focus();
				nameInput.select();
			} else {
				swatches.focusSelected();
			}
		});
		session.add(toDisposable(() => store.dispose()));
		return store;
	}

	/** Expands the custom color section of the open editor, as clicking the custom color swatch does. */
	expandCustomColor(): void {
		this.expandCustom?.();
	}
}

//#endregion

//#region Collection editor

export interface ICollectionEditorActions {
	deleteCollection(collectionId: string): void;
}

/** Edits a collection's name, icon, and color. */
export class ColorGroupsCollectionEditor extends Disposable {

	private readonly open = this._register(new MutableDisposable());

	constructor(
		private readonly model: ColorGroupsMockModel,
		private readonly scheme: ColorScheme,
		private readonly actions: ICollectionEditorActions,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
	}

	show(collectionId: string, anchor: () => HTMLElement, isNew = false): void {
		const checkpoint = this.model.checkpoint();
		const session = new DisposableStore();
		this.open.value = session;
		session.add(toDisposable(() => this.model.commitCheckpoint(isNew ? 'Created collection' : 'Edited collection', checkpoint)));
		this.contextViewService.showContextView({
			getAnchor: anchor,
			anchorAlignment: AnchorAlignment.LEFT,
			render: container => this.render(container, collectionId, isNew, session),
			onHide: () => {
				if (this.open.value === session) {
					this.open.clear();
				}
			},
		});
		session.add(toDisposable(() => this.contextViewService.hideContextView()));
	}

	hide(): void {
		this.open.clear();
	}

	private render(container: HTMLElement, collectionId: string, isNew: boolean, session: DisposableStore): IDisposable {
		const store = new DisposableStore();
		const root = DOM.append(container, $('.cg-popover.cg-collection-editor', { role: 'dialog', 'aria-label': isNew ? 'New collection' : 'Edit collection' }));
		const current = (): IMockCollection | undefined => getCollection(this.model.current, collectionId);
		const patch = (update: Partial<IMockCollection>) => this.model.update(undefined, draft => {
			const collection = getCollection(draft, collectionId);
			if (collection) {
				Object.assign(collection, update);
			}
		});

		DOM.append(root, $('.cg-editor-heading', undefined, isNew ? 'New collection' : 'Collection'));
		const nameRow = DOM.append(root, $('.cg-editor-row'));
		const nameInput = store.add(new InputBox(nameRow, undefined, { inputBoxStyles: defaultInputBoxStyles, ariaLabel: 'Collection name', placeholder: 'Name this collection' }));
		nameInput.value = current()?.name ?? '';
		store.add(nameInput.onDidChange(value => {
			if (value.trim()) {
				patch({ name: value.trim() });
			}
		}));

		DOM.append(root, $('.cg-editor-label', undefined, 'Icon'));
		const iconGrid = DOM.append(root, $('.cg-icon-grid', { role: 'radiogroup', 'aria-label': 'Icon' }));
		const iconButtons: { readonly icon: MockCollectionIcon; readonly element: HTMLElement }[] = [];
		for (const icon of COLLECTION_ICON_CHOICES) {
			const element = DOM.append(iconGrid, $('button.cg-icon-choice', { role: 'radio', type: 'button', 'aria-label': collectionIconLabel(icon) }));
			renderCollectionIcon(element, icon);
			store.add(this.hoverService.setupDelayedHover(element, { content: collectionIconLabel(icon) }));
			store.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, () => patch({ icon })));
			iconButtons.push({ icon, element });
		}
		store.add(DOM.addDisposableListener(iconGrid, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			const delta = event.equals(KeyCode.RightArrow) ? 1 : event.equals(KeyCode.LeftArrow) ? -1 : event.equals(KeyCode.DownArrow) ? 8 : event.equals(KeyCode.UpArrow) ? -8 : 0;
			if (!delta) {
				return;
			}
			event.preventDefault();
			const index = iconButtons.findIndex(b => b.element === DOM.getActiveElement());
			const next = iconButtons[Math.max(0, Math.min(iconButtons.length - 1, index + delta))];
			next.element.focus();
			next.element.click();
		}));

		DOM.append(root, $('.cg-editor-label', undefined, 'Color'));
		const swatches = store.add(new ColorSwatches(root, { scheme: this.scheme, allowCustom: false, ariaLabel: 'Collection color', onDidPick: color => patch({ color }) }, this.hoverService));

		const stats = DOM.append(root, $('.cg-editor-stats'));
		DOM.append(root, $('.cg-editor-separator'));
		const actionList = DOM.append(root, $('.cg-editor-actions', { role: 'menu' }));
		const addAction = (icon: ThemeIcon, text: string, run: () => void, enabled = true) => {
			const button = DOM.append(actionList, $<HTMLButtonElement>('button.cg-editor-action', { role: 'menuitem', type: 'button' }));
			button.disabled = !enabled;
			DOM.append(button, $(`span${ThemeIcon.asCSSSelector(icon)}`));
			DOM.append(button, $('span', undefined, text));
			store.add(DOM.addDisposableListener(button, DOM.EventType.CLICK, run));
		};
		const index = this.model.current.collections.findIndex(c => c.id === collectionId);
		const count = this.model.current.collections.length;
		addAction(Codicon.arrowLeft, 'Move left', () => this.model.moveCollection(collectionId, -1), index > 0);
		addAction(Codicon.arrowRight, 'Move right', () => this.model.moveCollection(collectionId, 1), index < count - 1);
		addAction(Codicon.trash, 'Delete collection', () => {
			this.hide();
			this.actions.deleteCollection(collectionId);
		}, count > 1);

		store.add(autorun(reader => {
			const state = this.model.state.read(reader);
			const collection = getCollection(state, collectionId);
			if (!collection) {
				return;
			}
			swatches.setSelected(collection.color);
			const iconColor = resolveMockColor(collection.color, this.scheme).fill;
			for (const { icon, element } of iconButtons) {
				const checked = icon === collection.icon;
				element.classList.toggle('checked', checked);
				element.setAttribute('aria-checked', String(checked));
				element.tabIndex = checked ? 0 : -1;
				element.style.color = checked ? iconColor : '';
			}
			const sessions = getCollectionSessions(state, collectionId);
			const groups = state.groups.filter(g => g.collectionId === collectionId).length;
			const workspaces = new Set(sessions.filter(s => s.workspace && !s.groupId).map(s => s.workspace)).size;
			stats.textContent = `${groups} group${groups === 1 ? '' : 's'} · ${workspaces} workspace${workspaces === 1 ? '' : 's'} · ${sessions.length} session${sessions.length === 1 ? '' : 's'}`;
		}));

		store.add(registerPopoverDismissal(root, () => this.hide()));
		store.add(DOM.addStandardDisposableListener(nameInput.inputElement, DOM.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter)) {
				e.preventDefault();
				this.hide();
			}
		}));
		DOM.getWindow(root).requestAnimationFrame(() => {
			nameInput.focus();
			nameInput.select();
		});
		session.add(toDisposable(() => store.dispose()));
		return store;
	}
}

/** The fill for a collection's accent, for the switcher. */
export function collectionAccent(collection: IMockCollection, scheme: ColorScheme): string {
	return collection.color.kind === 'palette' ? paletteValue(collection.color.id, scheme) : normalizeHex(collection.color.hex);
}

//#endregion
