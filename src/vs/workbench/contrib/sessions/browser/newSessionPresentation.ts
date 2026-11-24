/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { IObservable } from '../../../../base/common/observable.js';
import type { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export interface INewSessionWorkspaceOptions {
	readonly hoverDelegate: IHoverDelegate;
	readonly hasDetails?: IObservable<boolean>;
	getRepositoryControlId(element: HTMLElement): string | undefined;
	onDidChangeLayout?(): void;
}

export interface INewSessionWorkspacePresentation extends IDisposable {
	readonly sessionTypePickerHost: HTMLElement;
	/** When omitted, repository controls stay in the composer's own controls row. */
	readonly repositoryControlsHost?: HTMLElement;
	layout?(): void;
}

/** Entry-owned welcome layout; workspace selection, drafts and sending remain shared. */
export interface INewSessionPresentationController extends IDisposable {
	render(container: HTMLElement, content: HTMLElement): void;
	renderWorkspaceOptions(container: HTMLElement, row: HTMLElement, options: INewSessionWorkspaceOptions): INewSessionWorkspacePresentation;
	revealOptions?(): void;
}

export interface INewSessionPresentation {
	readonly searchWorkspaceTargetDirectly?: boolean;
	/** Place notices and the separate provider, repository and status controls row above the prompt. */
	readonly separateSessionControls?: boolean;
	getAccessibilityHelp(screenReaderOptimized: boolean, agentPickerInAttachContextMenu: boolean): readonly string[];
	create(isNewChatInSession: boolean, instantiationService: IInstantiationService): INewSessionPresentationController;
}
