/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GroupIdentifier, IWorkbenchEditorConfiguration, IEditorIdentifier, IEditorCloseEvent, IEditorPartOptions, IEditorPartOptionsChangeEvent, SideBySideEditor, EditorCloseContext, IEditorPane, IEditorPartLimitConfiguration, IEditorPartDecorationsConfiguration } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IEditorGroup, GroupDirection, IMergeGroupOptions, GroupsOrder, GroupsArrangement } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ISerializableView } from 'vs/base/browser/ui/grid/grid';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { OptionalBooleanKey, OptionalNumberKey, OptionalStringKey, isObject } from 'vs/base/common/types';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IWindowsConfiguration } from 'vs/platform/window/common/window';
import { ensureOptionalBooleanValue, ensureOptionalNumberValue, ensureOptionalStringValue } from 'vs/base/common/objects';

export interface IEditorPartCreationOptions {
	readonly restorePreviousState: boolean;
}

export const DEFAULT_EDITOR_MIN_DIMENSIONS = new Dimension(220, 70);
export const DEFAULT_EDITOR_MAX_DIMENSIONS = new Dimension(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

export const DEFAULT_EDITOR_PART_OPTIONS: IEditorPartOptions = {
	showTabs: 'multiple',
	highlightModifiedTabs: false,
	tabCloseButton: 'right',
	tabSizing: 'fit',
	tabSizingFixedMinWidth: 50,
	tabSizingFixedMaxWidth: 160,
	pinnedTabSizing: 'normal',
	pinnedTabsOnSeparateRow: false,
	tabHeight: 'default',
	preventPinnedEditorClose: 'keyboardAndMouse',
	titleScrollbarSizing: 'default',
	focusRecentEditorAfterClose: true,
	showIcons: true,
	hasIcons: true, // 'vs-seti' is our default icon theme
	enablePreview: true,
	openPositioning: 'right',
	openSideBySideDirection: 'right',
	closeEmptyGroups: true,
	labelFormat: 'default',
	splitSizing: 'auto',
	splitOnDragAndDrop: true,
	centeredLayoutFixedWidth: false,
	doubleClickTabToToggleEditorGroupSizes: 'expand',
};

export function impactsEditorPartOptions(event: IConfigurationChangeEvent): boolean {
	return event.affectsConfiguration('workbench.editor') || event.affectsConfiguration('workbench.iconTheme') || event.affectsConfiguration('window.density');
}

export function getEditorPartOptions(configurationService: IConfigurationService, themeService: IThemeService): IEditorPartOptions {
	const options = {
		...DEFAULT_EDITOR_PART_OPTIONS,
		hasIcons: themeService.getFileIconTheme().hasFileIcons
	};

	const config = configurationService.getValue<IWorkbenchEditorConfiguration>();
	if (config?.workbench?.editor) {

		// Assign all primitive configuration over
		Object.assign(options, config.workbench.editor);

		// Special handle array types and convert to Set
		if (isObject(config.workbench.editor.autoLockGroups)) {
			options.autoLockGroups = new Set();

			for (const [editorId, enablement] of Object.entries(config.workbench.editor.autoLockGroups)) {
				if (enablement === true) {
					options.autoLockGroups.add(editorId);
				}
			}
		} else {
			options.autoLockGroups = undefined;
		}
	}

	const windowConfig = configurationService.getValue<IWindowsConfiguration>();
	if (windowConfig?.window?.density?.editorTabHeight) {
		options.tabHeight = windowConfig.window.density.editorTabHeight;
	}

	validateEditorPartOptions(options);

	return options;
}

function validateEditorPartOptions(options: IEditorPartOptions): void {

	// Migrate: Show tabs (config migration kicks in very late and can cause flicker otherwise)
	if (typeof options.showTabs === 'boolean') {
		options.showTabs = options.showTabs ? 'multiple' : 'single';
	}

	// Boolean options
	const booleanOptions: Array<OptionalBooleanKey<IEditorPartOptions>> = [
		'wrapTabs',
		'scrollToSwitchTabs',
		'highlightModifiedTabs',
		'pinnedTabsOnSeparateRow',
		'focusRecentEditorAfterClose',
		'showIcons',
		'enablePreview',
		'enablePreviewFromQuickOpen',
		'enablePreviewFromCodeNavigation',
		'closeOnFileDelete',
		'closeEmptyGroups',
		'revealIfOpen',
		'mouseBackForwardToNavigate',
		'restoreViewState',
		'splitOnDragAndDrop',
		'centeredLayoutFixedWidth',
	];
	for (const option of booleanOptions) {
		if (typeof option === 'string') {
			ensureOptionalBooleanValue(options, option, Boolean(DEFAULT_EDITOR_PART_OPTIONS[option]));
		}
	}

	// Number options
	const numberOptions: Array<OptionalNumberKey<IEditorPartOptions>> = [
		'tabSizingFixedMinWidth',
		'tabSizingFixedMaxWidth'
	];
	for (const option of numberOptions) {
		if (typeof option === 'string') {
			ensureOptionalNumberValue(options, option, Number(DEFAULT_EDITOR_PART_OPTIONS[option]));
		}
	}

	// String options
	const stringOptions: Array<[OptionalStringKey<IEditorPartOptions>, Array<string>]> = [
		['showTabs', ['multiple', 'single', 'none']],
		['tabCloseButton', ['left', 'right', 'off']],
		['tabSizing', ['fit', 'shrink', 'fixed']],
		['pinnedTabSizing', ['normal', 'compact', 'shrink']],
		['tabHeight', ['default', 'compact']],
		['preventPinnedEditorClose', ['keyboardAndMouse', 'keyboard', 'mouse', 'never']],
		['titleScrollbarSizing', ['default', 'large']],
		['openPositioning', ['left', 'right', 'first', 'last']],
		['openSideBySideDirection', ['right', 'down']],
		['labelFormat', ['default', 'short', 'medium', 'long']],
		['splitInGroupLayout', ['vertical', 'horizontal']],
		['splitSizing', ['distribute', 'split', 'auto']],
		['doubleClickTabToToggleEditorGroupSizes', ['maximize', 'expand', 'off']]
	];
	for (const [option, allowed] of stringOptions) {
		if (typeof option === 'string') {
			ensureOptionalStringValue(options, option, allowed, String(DEFAULT_EDITOR_PART_OPTIONS[option]));
		}
	}

	// Complex options
	if (options.autoLockGroups && !(options.autoLockGroups instanceof Set)) {
		options.autoLockGroups = undefined;
	}
	if (options.limit && !isObject(options.limit)) {
		options.limit = undefined;
	} else if (options.limit) {
		const booleanLimitOptions: Array<OptionalBooleanKey<IEditorPartLimitConfiguration>> = [
			'enabled',
			'excludeDirty',
			'perEditorGroup'
		];
		for (const option of booleanLimitOptions) {
			if (typeof option === 'string') {
				ensureOptionalBooleanValue(options.limit, option, undefined);
			}
		}
		ensureOptionalNumberValue(options.limit, 'value', undefined);
	}
	if (options.decorations && !isObject(options.decorations)) {
		options.decorations = undefined;
	} else if (options.decorations) {
		const booleanDecorationOptions: Array<OptionalBooleanKey<IEditorPartDecorationsConfiguration>> = [
			'badges',
			'colors'
		];
		for (const option of booleanDecorationOptions) {
			if (typeof option === 'string') {
				ensureOptionalBooleanValue(options.decorations, option, undefined);
			}
		}
	}
}

/**
 * A helper to access editor groups across all opened editor parts.
 */
export interface IEditorPartsView {

	/**
	 * An array of all editor groups across all editor parts.
	 */
	readonly groups: IEditorGroupView[];

	/**
	 * Get the group based on an identifier across all opened
	 * editor parts.
	 */
	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined;
}

/**
 * A helper to access and mutate editor groups within an editor part.
 */
export interface IEditorGroupsView {

	readonly groups: IEditorGroupView[];
	readonly activeGroup: IEditorGroupView;

	readonly partOptions: IEditorPartOptions;
	readonly onDidChangeEditorPartOptions: Event<IEditorPartOptionsChangeEvent>;

	readonly onDidVisibilityChange: Event<boolean>;

	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined;
	getGroups(order: GroupsOrder): IEditorGroupView[];

	activateGroup(identifier: IEditorGroupView | GroupIdentifier): IEditorGroupView;
	restoreGroup(identifier: IEditorGroupView | GroupIdentifier): IEditorGroupView;

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection, groupToCopy?: IEditorGroupView): IEditorGroupView;
	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): IEditorGroupView;

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView;
	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView;

	removeGroup(group: IEditorGroupView | GroupIdentifier): void;

	arrangeGroups(arrangement: GroupsArrangement, target?: IEditorGroupView | GroupIdentifier): void;
	toggleMaximizeGroup(group?: IEditorGroupView | GroupIdentifier): void;
	toggleExpandGroup(group?: IEditorGroupView | GroupIdentifier): void;
}

export interface IEditorGroupTitleHeight {

	/**
	 * The overall height of the editor group title control.
	 */
	readonly total: number;

	/**
	 * The height offset to e.g. use when drawing drop overlays.
	 * This number may be smaller than `height` if the title control
	 * decides to have an `offset` that is within the title control
	 * (e.g. when breadcrumbs are enabled).
	 */
	readonly offset: number;
}

/**
 * A helper to access and mutate an editor group within an editor part.
 */
export interface IEditorGroupView extends IDisposable, ISerializableView, IEditorGroup {

	readonly onDidFocus: Event<void>;

	readonly onDidOpenEditorFail: Event<EditorInput>;
	readonly onDidCloseEditor: Event<IEditorCloseEvent>;

	readonly groupsView: IEditorGroupsView;

	/**
	 * A promise that resolves when the group has been restored.
	 *
	 * For a group with active editor, the promise will resolve
	 * when the active editor has finished to resolve.
	 */
	readonly whenRestored: Promise<void>;

	readonly titleHeight: IEditorGroupTitleHeight;

	readonly disposed: boolean;

	setActive(isActive: boolean): void;

	notifyIndexChanged(newIndex: number): void;
	notifyLabelChanged(newLabel: string): void;

	openEditor(editor: EditorInput, options?: IEditorOptions, internalOptions?: IInternalEditorOpenOptions): Promise<IEditorPane | undefined>;

	relayout(): void;
}

export function fillActiveEditorViewState(group: IEditorGroup, expectedActiveEditor?: EditorInput, presetOptions?: IEditorOptions): IEditorOptions {
	if (!expectedActiveEditor || !group.activeEditor || expectedActiveEditor.matches(group.activeEditor)) {
		const options: IEditorOptions = {
			...presetOptions,
			viewState: group.activeEditorPane?.getViewState()
		};

		return options;
	}

	return presetOptions || Object.create(null);
}

/**
 * A sub-interface of IEditorService to hide some workbench-core specific
 * events from clients.
 */
export interface EditorServiceImpl extends IEditorService {

	/**
	 * Emitted when an editor failed to open.
	 */
	readonly onDidOpenEditorFail: Event<IEditorIdentifier>;

	/**
	 * Emitted when the list of most recently active editors change.
	 */
	readonly onDidMostRecentlyActiveEditorsChange: Event<void>;
}

export interface IInternalEditorTitleControlOptions {

	/**
	 * A hint to defer updating the title control for perf reasons.
	 * The caller must ensure to update the title control then.
	 */
	readonly skipTitleUpdate?: boolean;
}

export interface IInternalEditorOpenOptions extends IInternalEditorTitleControlOptions {

	/**
	 * Whether to consider a side by side editor as matching
	 * when figuring out if the editor to open is already
	 * opened or not. By default, side by side editors will
	 * not be considered as matching, even if the editor is
	 * opened in one of the sides.
	 */
	readonly supportSideBySide?: SideBySideEditor.ANY | SideBySideEditor.BOTH;

	/**
	 * When set to `true`, pass DOM focus into the tab control.
	 */
	readonly focusTabControl?: boolean;

	/**
	 * When set to `true`, will not attempt to move the window to
	 * the top that the editor opens in.
	 */
	readonly preserveWindowOrder?: boolean;
}

export interface IInternalEditorCloseOptions extends IInternalEditorTitleControlOptions {

	/**
	 * A hint that the editor is closed due to an error opening. This can be
	 * used to optimize how error toasts are appearing if any.
	 */
	readonly fromError?: boolean;

	/**
	 * Additional context as to why an editor is closed.
	 */
	readonly context?: EditorCloseContext;
}

export interface IInternalMoveCopyOptions extends IInternalEditorOpenOptions {

	/**
	 * Whether to close the editor at the source or keep it.
	 */
	readonly keepCopy?: boolean;
}
