/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import type { Event } from '../../../../base/common/event.js';
import type { IDisposable } from '../../../../base/common/lifecycle.js';
import type { IObservable } from '../../../../base/common/observable.js';
import type { IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import type { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import type { ISession } from '../../../services/sessions/common/session.js';
import type { NewSessionBanners } from '../common/newSessionBanners.js';
import type { ISessionInputPickerVisibility } from '../common/sessionPickerVisibility.js';

/** The owning composer's state and interactions, without a dependency on an optional feature. */
export interface INewSessionInputContext {
	readonly session: IObservable<ISession | undefined>;
	readonly pickerVisibility: ISessionInputPickerVisibility;
	readonly visible: IObservable<boolean>;
	readonly getInputValue: () => string;
	readonly onDidChangeInput: Event<void>;
	readonly focusInput: () => void;
	readonly revealIsolationPicker: () => void;
	readonly openIsolationPicker: () => void;
	readonly banners: NewSessionBanners;
}

export interface INewSessionInputController extends IDisposable {
	confirmBeforeSend(query: string): Promise<boolean>;
}

export interface IConfigPickerItem {
	readonly id?: string;
	readonly value: string;
	readonly label: string;
	readonly description?: string;
	readonly checked?: boolean;
	readonly disabled?: boolean;
	readonly badge?: string;
	readonly secondaryBadge?: boolean;
	/** Runs instead of selecting a configuration value. */
	readonly run?: () => void;
}

export interface IIsolationPickerTriggerContext {
	readonly trigger: HTMLElement;
	readonly sessionId: string;
	readonly title: string;
	readonly label: string;
	readonly ariaLabel: string;
	readonly tooltip: string | undefined;
	readonly hoverDelegate: IHoverDelegate;
}

/** A presentation captured for one open picker. Configuration writes remain owned by the picker. */
export interface IIsolationPickerRecommendation {
	readonly className?: string;
	readonly minWidth?: number;
	decorateOptions(items: readonly IConfigPickerItem[]): readonly IConfigPickerItem[];
	appendItems(items: IActionListItem<IConfigPickerItem>[]): IActionListItem<IConfigPickerItem>[];
	onSelect(value: string): void;
	onDidShow?(options: IActionListItem<IConfigPickerItem>[], updateItems: (items: IActionListItem<IConfigPickerItem>[]) => void): IDisposable;
}

export interface ISessionIsolationPickerPresentation {
	/** The trigger owns the returned listeners, independently of the open picker's lifetime. */
	renderTrigger(context: IIsolationPickerTriggerContext): IDisposable;
	getRecommendation(sessionId: string): IIsolationPickerRecommendation | undefined;
}

/** Selected by the entry. Each factory uses the owning surface's instantiation scope. */
export interface INewSessionInputPresentation {
	getAccessibilityHelp?(): string;
	createComposer?(container: HTMLElement, context: INewSessionInputContext, instantiationService: IInstantiationService): INewSessionInputController;
	createIsolationPicker?(session: IObservable<ISession | undefined>, instantiationService: IInstantiationService): ISessionIsolationPickerPresentation;
}
