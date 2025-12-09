/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Command } from '../../../../editor/common/languages.js';
import { IAction } from '../../../../base/common/actions.js';
import { IMenu } from '../../../../platform/actions/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { ISCMHistoryProvider } from './history.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IObservable } from '../../../../base/common/observable.js';
import { ISCMArtifact, ISCMArtifactGroup, ISCMArtifactProvider } from './artifact.js';

export const VIEWLET_ID = 'workbench.view.scm';
export const VIEW_PANE_ID = 'workbench.scm';
export const REPOSITORIES_VIEW_PANE_ID = 'workbench.scm.repositories';
export const HISTORY_VIEW_PANE_ID = 'workbench.scm.history';

export const enum ViewMode {
	List = 'list',
	Tree = 'tree'
}

export interface IBaselineResourceProvider {
	getBaselineResource(resource: URI): Promise<URI>;
}

export const ISCMService = createDecorator<ISCMService>('scm');

export interface ISCMResourceDecorations {
	icon?: URI | ThemeIcon;
	iconDark?: URI | ThemeIcon;
	tooltip?: string;
	strikeThrough?: boolean;
	faded?: boolean;
}

export interface ISCMResource {
	readonly resourceGroup: ISCMResourceGroup;
	readonly sourceUri: URI;
	readonly decorations: ISCMResourceDecorations;
	readonly contextValue: string | undefined;
	readonly command: Command | undefined;
	readonly multiDiffEditorOriginalUri: URI | undefined;
	readonly multiDiffEditorModifiedUri: URI | undefined;
	open(preserveFocus: boolean): Promise<void>;
}

export interface ISCMResourceGroup {
	readonly id: string;
	readonly provider: ISCMProvider;

	readonly resources: readonly ISCMResource[];
	readonly resourceTree: ResourceTree<ISCMResource, ISCMResourceGroup>;
	readonly onDidChangeResources: Event<void>;

	readonly label: string;
	contextValue: string | undefined;
	readonly hideWhenEmpty: boolean;
	readonly onDidChange: Event<void>;

	readonly multiDiffEditorEnableViewChanges: boolean;
}

export interface ISCMProvider extends IDisposable {
	readonly id: string;
	readonly parentId?: string;
	readonly providerId: string;
	readonly label: string;
	readonly name: string;

	readonly groups: readonly ISCMResourceGroup[];
	readonly onDidChangeResourceGroups: Event<void>;
	readonly onDidChangeResources: Event<void>;

	readonly rootUri?: URI;
	readonly iconPath?: URI | { light: URI; dark: URI } | ThemeIcon;
	readonly inputBoxTextModel: ITextModel;
	readonly contextValue: IObservable<string | undefined>;
	readonly count: IObservable<number | undefined>;
	readonly commitTemplate: IObservable<string>;
	readonly artifactProvider: IObservable<ISCMArtifactProvider | undefined>;
	readonly historyProvider: IObservable<ISCMHistoryProvider | undefined>;
	readonly acceptInputCommand?: Command;
	readonly actionButton: IObservable<ISCMActionButtonDescriptor | undefined>;
	readonly statusBarCommands: IObservable<readonly Command[] | undefined>;

	getOriginalResource(uri: URI): Promise<URI | null>;
}

export interface ISCMInputValueProviderContext {
	readonly resourceGroupId: string;
	readonly resources: readonly URI[];
}

export const enum InputValidationType {
	Error = 0,
	Warning = 1,
	Information = 2
}

export interface IInputValidation {
	message: string | IMarkdownString;
	type: InputValidationType;
}

export interface IInputValidator {
	(value: string, cursorPosition: number): Promise<IInputValidation | undefined>;
}

export enum SCMInputChangeReason {
	HistoryPrevious,
	HistoryNext
}

export interface ISCMInputChangeEvent {
	readonly value: string;
	readonly reason?: SCMInputChangeReason;
}

export interface ISCMActionButtonDescriptor {
	command: Command & { shortTitle?: string };
	secondaryCommands?: Command[][];
	enabled: boolean;
}

export interface ISCMActionButton {
	readonly type: 'actionButton';
	readonly repository: ISCMRepository;
	readonly button: ISCMActionButtonDescriptor;
}

export interface ISCMInput {
	readonly repository: ISCMRepository;

	readonly value: string;
	setValue(value: string, fromKeyboard: boolean): void;
	readonly onDidChange: Event<ISCMInputChangeEvent>;

	placeholder: string;
	readonly onDidChangePlaceholder: Event<string>;

	validateInput: IInputValidator;
	readonly onDidChangeValidateInput: Event<void>;

	enabled: boolean;
	readonly onDidChangeEnablement: Event<boolean>;

	visible: boolean;
	readonly onDidChangeVisibility: Event<boolean>;

	setFocus(): void;
	readonly onDidChangeFocus: Event<void>;

	showValidationMessage(message: string | IMarkdownString, type: InputValidationType): void;
	readonly onDidChangeValidationMessage: Event<IInputValidation>;

	showNextHistoryValue(): void;
	showPreviousHistoryValue(): void;
}

export interface ISCMRepository extends IDisposable {
	readonly id: string;
	readonly provider: ISCMProvider;
	readonly input: ISCMInput;
}

export interface ISCMService {

	readonly _serviceBrand: undefined;
	readonly onDidAddRepository: Event<ISCMRepository>;
	readonly onDidRemoveRepository: Event<ISCMRepository>;
	readonly repositories: Iterable<ISCMRepository>;
	readonly repositoryCount: number;

	registerSCMProvider(provider: ISCMProvider): ISCMRepository;

	getRepository(id: string): ISCMRepository | undefined;
	getRepository(resource: URI): ISCMRepository | undefined;
}

export interface ISCMTitleMenu {
	readonly actions: IAction[];
	readonly secondaryActions: IAction[];
	readonly onDidChangeTitle: Event<void>;
	readonly menu: IMenu;
}

export interface ISCMRepositoryMenus {
	readonly titleMenu: ISCMTitleMenu;
	getRepositoryMenu(repository: ISCMRepository): IMenu;
	getRepositoryContextMenu(repository: ISCMRepository): IMenu;
	getResourceGroupMenu(group: ISCMResourceGroup): IMenu;
	getResourceMenu(resource: ISCMResource): IMenu;
	getResourceFolderMenu(group: ISCMResourceGroup): IMenu;
	getArtifactGroupMenu(artifactGroup: ISCMArtifactGroup): IMenu;
	getArtifactMenu(artifactGroup: ISCMArtifactGroup, artifact: ISCMArtifact): IMenu;
}

export interface ISCMMenus {
	getRepositoryMenus(provider: ISCMProvider): ISCMRepositoryMenus;
}

export const enum ISCMRepositorySortKey {
	DiscoveryTime = 'discoveryTime',
	Name = 'name',
	Path = 'path'
}

export const enum ISCMRepositorySelectionMode {
	Single = 'single',
	Multiple = 'multiple'
}

export const ISCMViewService = createDecorator<ISCMViewService>('scmView');

export interface ISCMViewVisibleRepositoryChangeEvent {
	readonly added: Iterable<ISCMRepository>;
	readonly removed: Iterable<ISCMRepository>;
}

export interface ISCMViewService {
	readonly _serviceBrand: undefined;

	readonly menus: ISCMMenus;
	readonly selectionModeConfig: IObservable<ISCMRepositorySelectionMode>;
	readonly explorerEnabledConfig: IObservable<boolean>;
	readonly graphShowIncomingChangesConfig: IObservable<boolean>;
	readonly graphShowOutgoingChangesConfig: IObservable<boolean>;

	repositories: ISCMRepository[];
	readonly onDidChangeRepositories: Event<ISCMViewVisibleRepositoryChangeEvent>;
	readonly didFinishLoadingRepositories: IObservable<boolean>;

	visibleRepositories: readonly ISCMRepository[];
	readonly onDidChangeVisibleRepositories: Event<ISCMViewVisibleRepositoryChangeEvent>;

	isVisible(repository: ISCMRepository): boolean;
	toggleVisibility(repository: ISCMRepository, visible?: boolean): void;

	toggleSortKey(sortKey: ISCMRepositorySortKey): void;
	toggleSelectionMode(selectionMode: ISCMRepositorySelectionMode): void;

	readonly focusedRepository: ISCMRepository | undefined;
	readonly onDidFocusRepository: Event<ISCMRepository | undefined>;
	focus(repository: ISCMRepository): void;

	/**
	 * The active repository is the repository selected in the Source Control Repositories view
	 * or the repository associated with the active editor. The active repository is shown in the
	 * Source Control Repository status bar item.
	 */
	readonly activeRepository: IObservable<{ repository: ISCMRepository; pinned: boolean } | undefined>;
	pinActiveRepository(repository: ISCMRepository | undefined): void;
}
