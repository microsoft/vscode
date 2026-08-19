/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/externalSessionBanner.css';
import * as dom from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { ISelectOptionItem, SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ChatExternalSessionsMode } from '../../../../platform/chat/common/chatSettings.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfirmation, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISession } from '../../../services/sessions/common/session.js';

const EXTERNAL_SESSION_BANNER_DISMISSED_STORAGE_KEY = 'sessions.externalSessionBanner.dismissed';
const DAY = 24 * 60 * 60 * 1000;

interface IExternalSessionOption {
	readonly mode: ChatExternalSessionsMode | undefined;
	readonly item: ISelectOptionItem;
}

interface IExternalSessionBannerOptions {
	readonly initialMode?: ChatExternalSessionsMode;
	readonly onDidChangeLayout?: (visible: boolean) => void;
	readonly onDidDismissWithFocus?: () => void;
}

export function shouldConfirmExternalSessionVisibilityChange(mode: ChatExternalSessionsMode, updatedAt: Date, now: number): boolean {
	switch (mode) {
		case ChatExternalSessionsMode.Recent:
			return true;
		case ChatExternalSessionsMode.None:
			return true;
		case ChatExternalSessionsMode.All:
			return false;
		case ChatExternalSessionsMode.Last24Hours:
			return updatedAt.getTime() < now - DAY;
		case ChatExternalSessionsMode.Last7Days:
			return updatedAt.getTime() < now - 7 * DAY;
	}
}

export function getExternalSessionVisibilityConfirmation(mode: ChatExternalSessionsMode, updatedAt: Date, now: number, productName: string): IConfirmation {
	const message = mode === ChatExternalSessionsMode.Recent
		? localize('externalSessionBanner.confirm.recent.message', "This session may no longer appear in {0}", productName)
		: localize('externalSessionBanner.confirm.message', "This session will no longer appear in {0}", productName);
	const primaryButton = localize({ key: 'externalSessionBanner.confirm.save', comment: ['&& denotes a mnemonic'] }, "&&Save Anyway");

	if (mode === ChatExternalSessionsMode.Recent) {
		return {
			type: 'warning',
			message,
			detail: localize('externalSessionBanner.confirm.recent.detail', "Only the 2 most recently updated external sessions from the last 7 days will be shown. Are you sure you want to save this change?"),
			primaryButton,
		};
	}

	if (mode === ChatExternalSessionsMode.None) {
		return {
			type: 'warning',
			message,
			detail: localize('externalSessionBanner.confirm.none.detail', "The option you selected hides sessions created in another application, including the session you currently have open. Are you sure you want to save this change?"),
			primaryButton,
		};
	}

	const daysAgo = Math.max(1, Math.ceil((now - updatedAt.getTime()) / DAY));
	const lastUpdated = daysAgo === 1
		? localize('externalSessionBanner.confirm.oneDayAgo', "1 day ago")
		: localize('externalSessionBanner.confirm.daysAgo', "{0} days ago", daysAgo);
	const detail = mode === ChatExternalSessionsMode.Last24Hours
		? localize('externalSessionBanner.confirm.lastDay.detail', "Only external sessions updated in the last day will be shown. This session was last updated {0}. Are you sure you want to save this change?", lastUpdated)
		: localize('externalSessionBanner.confirm.last7Days.detail', "Only external sessions updated in the last 7 days will be shown. This session was last updated {0}. Are you sure you want to save this change?", lastUpdated);

	return { type: 'warning', message, detail, primaryButton };
}

export class ExternalSessionBanner extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _session: ISettableObservable<ISession | undefined>;
	private readonly _dismissed: ISettableObservable<boolean>;
	private readonly _selectBox: SelectBox;
	private readonly _saveButton: Button;
	private readonly _options: readonly IExternalSessionOption[];

	private _lastSession: ISession | undefined;
	private _selectedMode: ChatExternalSessionsMode | undefined;
	private _visible = false;
	private _saving = false;

	constructor(
		container: HTMLElement,
		private readonly _bannerOptions: IExternalSessionBannerOptions,
		@IContextViewService contextViewService: IContextViewService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProductService private readonly _productService: IProductService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._session = observableValue(this, undefined);
		this._dismissed = observableValue(this, this._storageService.getBoolean(EXTERNAL_SESSION_BANNER_DISMISSED_STORAGE_KEY, StorageScope.PROFILE, false));
		this._selectedMode = _bannerOptions.initialMode;
		this._options = this._createOptions();

		this.domNode = dom.append(container, dom.$('.external-session-banner.hidden'));
		this.domNode.setAttribute('role', 'group');
		this.domNode.setAttribute('aria-label', localize('externalSessionBanner.ariaLabel', "External session visibility"));

		const content = dom.append(this.domNode, dom.$('.external-session-banner-content'));
		dom.append(content, dom.$('.external-session-banner-message')).textContent = localize(
			'externalSessionBanner.message',
			"{0} picked up this session, which was created in another application.",
			this._productService.nameShort
		);
		dom.append(content, dom.$('.external-session-banner-description', { role: 'status' })).textContent = localize(
			'externalSessionBanner.description',
			"Choose which external sessions you want to see in {0}. You can change this later in Settings.",
			this._productService.nameShort
		);

		const controls = dom.append(content, dom.$('.external-session-banner-controls'));
		const selectContainer = dom.append(controls, dom.$('.external-session-banner-select'));
		const selectedIndex = Math.max(0, this._options.findIndex(option => option.mode === this._selectedMode));
		this._selectBox = this._register(new SelectBox(
			this._options.map(option => option.item),
			selectedIndex,
			contextViewService,
			defaultSelectBoxStyles,
			{
				ariaLabel: localize('externalSessionBanner.select.ariaLabel', "External sessions to show"),
				useCustomDrawn: true,
			}
		));
		this._selectBox.render(selectContainer);
		this._register(this._selectBox.onDidSelect(event => this._setSelectedMode(this._options[event.index]?.mode)));

		this._saveButton = this._register(new Button(controls, defaultButtonStyles));
		this._saveButton.element.classList.add('external-session-banner-save');
		this._saveButton.label = localize('externalSessionBanner.save', "Save");
		this._register(this._saveButton.onDidClick(() => {
			void this._saveSelection().catch(error => this._notificationService.error(error));
		}));
		this._setSaveButtonVisible(this._selectedMode !== undefined);

		const actionsContainer = dom.append(this.domNode, dom.$('.external-session-banner-actions'));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, actionsContainer, {
			ariaLabel: localize('externalSessionBanner.actions.ariaLabel', "External session banner actions"),
		}));
		const closeAction = this._register(new Action(
			'externalSessionBanner.close',
			localize('externalSessionBanner.close', "Close"),
			ThemeIcon.asClassName(Codicon.closeCompact),
			true,
			() => this._dismiss()
		));
		toolbar.setActions([closeAction]);

		this._register(this._storageService.onDidChangeValue(
			StorageScope.PROFILE,
			EXTERNAL_SESSION_BANNER_DISMISSED_STORAGE_KEY,
			this._store
		)(() => {
			this._dismissed.set(this._storageService.getBoolean(EXTERNAL_SESSION_BANNER_DISMISSED_STORAGE_KEY, StorageScope.PROFILE, false), undefined);
		}));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const visible = !this._dismissed.read(reader) && session?.isExternal?.read(reader) === true;
			this._setVisible(visible);
		}));
	}

	get visible(): boolean {
		return this._visible;
	}

	setSession(session: ISession | undefined): void {
		if (this._lastSession && (!session || !isEqual(this._lastSession.resource, session.resource))) {
			this._setSelectedMode(undefined);
			this._selectBox.select(0);
		}
		this._lastSession = session;
		this._session.set(session, undefined);
	}

	private _createOptions(): readonly IExternalSessionOption[] {
		return [
			{
				mode: undefined,
				item: {
					text: localize('externalSessionBanner.select.placeholder', "Pick an option"),
					isDisabled: true,
				},
			},
			{
				mode: ChatExternalSessionsMode.None,
				item: {
					text: localize('externalSessionBanner.select.none', "None"),
					description: localize('externalSessionBanner.select.none.description', "Do not show sessions created in another application."),
				},
			},
			{
				mode: ChatExternalSessionsMode.Recent,
				item: {
					text: localize('externalSessionBanner.select.recent', "Recent"),
					description: localize('externalSessionBanner.select.recent.description', "Show the 2 most recently updated external sessions from the last 7 days."),
				},
			},
			{
				mode: ChatExternalSessionsMode.Last24Hours,
				item: {
					text: localize('externalSessionBanner.select.last24Hours', "Last 24 Hours"),
					description: localize('externalSessionBanner.select.last24Hours.description', "Show external sessions updated in the last 24 hours."),
				},
			},
			{
				mode: ChatExternalSessionsMode.Last7Days,
				item: {
					text: localize('externalSessionBanner.select.last7Days', "Last 7 Days"),
					description: localize('externalSessionBanner.select.last7Days.description', "Show external sessions updated in the last 7 days."),
				},
			},
			{
				mode: ChatExternalSessionsMode.All,
				item: {
					text: localize('externalSessionBanner.select.all', "All"),
					description: localize('externalSessionBanner.select.all.description', "Show all sessions created in another application."),
				},
			},
		];
	}

	private _setSelectedMode(mode: ChatExternalSessionsMode | undefined): void {
		this._selectedMode = mode;
		this._setSaveButtonVisible(mode !== undefined);
	}

	private _setSaveButtonVisible(visible: boolean): void {
		const wasVisible = !this._saveButton.element.classList.contains('hidden');
		this._saveButton.element.classList.toggle('hidden', !visible);
		if (wasVisible !== visible) {
			this._bannerOptions.onDidChangeLayout?.(this._visible);
		}
	}

	private _setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}

		const hadFocus = !visible && this.domNode.contains(this.domNode.ownerDocument.activeElement);
		this._visible = visible;
		this.domNode.classList.toggle('hidden', !visible);
		this._bannerOptions.onDidChangeLayout?.(visible);
		if (hadFocus) {
			this._bannerOptions.onDidDismissWithFocus?.();
		}
	}

	private async _saveSelection(): Promise<void> {
		const mode = this._selectedMode;
		const session = this._session.get();
		if (!mode || !session) {
			throw new Error(localize('externalSessionBanner.save.invalidState', "Unable to save external session visibility because no option or session is selected."));
		}
		if (this._saving) {
			return;
		}

		this._saving = true;
		this._saveButton.enabled = false;
		try {
			const now = Date.now();
			const updatedAt = session.updatedAt.get();
			if (shouldConfirmExternalSessionVisibilityChange(mode, updatedAt, now)) {
				const confirmation = await this._dialogService.confirm(getExternalSessionVisibilityConfirmation(mode, updatedAt, now, this._productService.nameShort));
				if (!confirmation.confirmed) {
					return;
				}
			}

			await this._configurationService.updateValue(ChatConfiguration.ShowExternalAgentSessions, mode, ConfigurationTarget.USER);
			this._dismiss();
		} finally {
			this._saving = false;
			this._saveButton.enabled = true;
		}
	}

	private _dismiss(): void {
		this._storageService.store(EXTERNAL_SESSION_BANNER_DISMISSED_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		this._dismissed.set(true, undefined);
	}
}
