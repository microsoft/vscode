/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import type { MultiDiffEditorVariant } from '../../../../editor/common/multiDiffEditor.js';
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';

/** The editor pane identifier of the multi diff editor. */
export const MULTI_DIFF_EDITOR_ID = 'multiDiffEditor';

export const multiDiffEditorExperimentalVariantSetting = 'multiDiffEditor.experimental.variant';
export const defaultMultiDiffEditorExperimentalVariant = 'noCards';
export const multiDiffEditorExperimentalFileListSetting = 'multiDiffEditor.experimental.fileList';

export type MultiDiffEditorExperimentalVariant = 'cards' | 'noCards';

export function getWorkbenchMultiDiffEditorVariant(variant: MultiDiffEditorExperimentalVariant): MultiDiffEditorVariant {
	return variant;
}

export function observableWorkbenchMultiDiffEditorVariant(
	owner: object,
	configurationService: IConfigurationService,
): IObservable<MultiDiffEditorVariant> {
	return observableConfigValue<MultiDiffEditorExperimentalVariant>(
		multiDiffEditorExperimentalVariantSetting,
		defaultMultiDiffEditorExperimentalVariant,
		configurationService,
	).map(owner, getWorkbenchMultiDiffEditorVariant);
}

const multiDiffEditorFileListHiddenStorageKey = 'multiDiffEditor.fileListHidden';

export const MultiDiffEditorFileListAvailableContext = new RawContextKey<boolean>('multiDiffEditorFileListAvailable', false, localize('multiDiffEditorFileListAvailable', "Whether the active multi diff editor supports the changed files list"));
export const MultiDiffEditorFileListEnabledContext = new RawContextKey<boolean>('multiDiffEditorFileListEnabled', false, localize('multiDiffEditorFileListEnabled', "Whether the changed files list is enabled in the active multi diff editor"));
/** Whether the file list is currently rendered, including responsive hiding. */
export const MultiDiffEditorFileListVisibleContext = new RawContextKey<boolean>('multiDiffEditorFileListVisible', false, localize('multiDiffEditorFileListVisible', "Whether the multi diff editor shows the list of changed files"));
export const MultiDiffEditorFileListFocusedContext = new RawContextKey<boolean>('multiDiffEditorFileListFocus', true, localize('multiDiffEditorFileListFocus', "Whether focus is in the multi diff editor changed files list"));

/** Whether the active editor is a multi diff editor that supports the changed files list. */
export const ActiveMultiDiffEditorHasFileListContext = ContextKeyExpr.and(
	ActiveEditorContext.isEqualTo(MULTI_DIFF_EDITOR_ID),
	ContextKeyExpr.has(`config.${multiDiffEditorExperimentalFileListSetting}`),
	MultiDiffEditorFileListAvailableContext,
)!;

/** The submenu that switches the changed files list between a list and a tree, and moves it to either side of the diffs. */
export const MultiDiffEditorFilesViewAndPositionMenu = new MenuId('MultiDiffEditorFilesViewAndPosition');

/**
 * Observes whether the file list should be shown. All multi diff editors share
 * the state, so toggling the list in one editor updates the others.
 */
export function observableMultiDiffEditorFileListVisible(owner: object, configurationService: IConfigurationService, storageService: IStorageService, store: DisposableStore): IObservable<boolean> {
	const enabled = observableConfigValue<boolean>(multiDiffEditorExperimentalFileListSetting, false, configurationService);
	const hidden = observableFromEvent(
		owner,
		storageService.onDidChangeValue(StorageScope.PROFILE, multiDiffEditorFileListHiddenStorageKey, store),
		() => storageService.getBoolean(multiDiffEditorFileListHiddenStorageKey, StorageScope.PROFILE, false),
	);
	return derived(owner, reader => enabled.read(reader) && !hidden.read(reader));
}

/** Shows the file list if the user has hidden it, and hides it otherwise. */
export function toggleMultiDiffEditorFileList(storageService: IStorageService): void {
	if (storageService.getBoolean(multiDiffEditorFileListHiddenStorageKey, StorageScope.PROFILE, false)) {
		storageService.remove(multiDiffEditorFileListHiddenStorageKey, StorageScope.PROFILE);
	} else {
		storageService.store(multiDiffEditorFileListHiddenStorageKey, true, StorageScope.PROFILE, StorageTarget.USER);
	}
}

export type MultiDiffEditorFileListViewMode = 'list' | 'tree';

const multiDiffEditorFileListViewModeStorageKey = 'multiDiffEditor.fileListViewMode';

export const MultiDiffEditorFileListViewModeContext = new RawContextKey<MultiDiffEditorFileListViewMode>('multiDiffEditorFileListViewMode', 'list', localize('multiDiffEditorFileListViewMode', "Whether the multi diff editor file list shows the files as a flat list or as a tree of folders"));

/** Observes the view mode of the file list, shared by all multi diff editors. */
export function observableMultiDiffEditorFileListViewMode(owner: object, storageService: IStorageService, store: DisposableStore): IObservable<MultiDiffEditorFileListViewMode> {
	return observableFromEvent(
		owner,
		storageService.onDidChangeValue(StorageScope.PROFILE, multiDiffEditorFileListViewModeStorageKey, store),
		() => storageService.get(multiDiffEditorFileListViewModeStorageKey, StorageScope.PROFILE) === 'tree' ? 'tree' : 'list',
	);
}

export function setMultiDiffEditorFileListViewMode(storageService: IStorageService, viewMode: MultiDiffEditorFileListViewMode): void {
	if (viewMode === 'tree') {
		storageService.store(multiDiffEditorFileListViewModeStorageKey, viewMode, StorageScope.PROFILE, StorageTarget.USER);
	} else {
		storageService.remove(multiDiffEditorFileListViewModeStorageKey, StorageScope.PROFILE);
	}
}

export type MultiDiffEditorFileListPosition = 'left' | 'right';

const multiDiffEditorFileListPositionStorageKey = 'multiDiffEditor.fileListPosition';

export const MultiDiffEditorFileListPositionContext = new RawContextKey<MultiDiffEditorFileListPosition>('multiDiffEditorFileListPosition', 'right', localize('multiDiffEditorFileListPosition', "The position of the multi diff editor file list"));

/** Observes the position of the file list, shared by all multi diff editors. */
export function observableMultiDiffEditorFileListPosition(owner: object, storageService: IStorageService, store: DisposableStore): IObservable<MultiDiffEditorFileListPosition> {
	return observableFromEvent(
		owner,
		storageService.onDidChangeValue(StorageScope.PROFILE, multiDiffEditorFileListPositionStorageKey, store),
		() => storageService.get(multiDiffEditorFileListPositionStorageKey, StorageScope.PROFILE) === 'left' ? 'left' : 'right',
	);
}

export function setMultiDiffEditorFileListPosition(storageService: IStorageService, position: MultiDiffEditorFileListPosition): void {
	if (position === 'left') {
		storageService.store(multiDiffEditorFileListPositionStorageKey, position, StorageScope.PROFILE, StorageTarget.USER);
	} else {
		storageService.remove(multiDiffEditorFileListPositionStorageKey, StorageScope.PROFILE);
	}
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'multiDiffEditor',
	title: localize('multiDiffEditorConfigurationTitle', "Multi Diff Editor"),
	type: 'object',
	properties: {
		[multiDiffEditorExperimentalVariantSetting]: {
			type: 'string',
			enum: ['cards', 'noCards'],
			enumDescriptions: [
				localize('multiDiffEditor.experimental.variant.cards', "Use the compact card-based variant."),
				localize('multiDiffEditor.experimental.variant.noCards', "Use the compact variant without cards."),
			],
			default: defaultMultiDiffEditorExperimentalVariant,
			description: localize('multiDiffEditor.experimental.variant', "Controls the experimental variant of the multi diff editor."),
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[multiDiffEditorExperimentalFileListSetting]: {
			type: 'boolean',
			default: false,
			description: localize('multiDiffEditor.experimental.fileList', "Controls whether newly created multi diff editors support a list of the changed files alongside the diffs. Reload the window to apply this change to existing editors."),
			agentsWindow: { default: true },
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
		},
	},
});
