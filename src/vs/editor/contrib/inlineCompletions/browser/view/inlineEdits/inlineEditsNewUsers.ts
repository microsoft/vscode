/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue, runOnChange, runOnChangeWithCancellationToken } from '../../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { InlineEditsGutterIndicator } from './components/gutterIndicatorView.js';
import { ModelPerInlineEdit } from './inlineEditsModel.js';
import { InlineEditsCollapsedView } from './inlineEditsViews/inlineEditsCollapsedView.js';

enum UserKind {
	FirstTime = 'firstTime',
	SecondTime = 'secondTime',
	Active = 'active'
}

export class InlineEditsOnboardingExperience extends Disposable {

	private readonly _disposables = this._register(new MutableDisposable());

	private readonly _setupDone = observableValue({ name: 'setupDone' }, false);

	private readonly _activeCompletionId = derived<string | undefined>(reader => {
		const model = this._model.read(reader);
		if (!model) { return undefined; }

		if (!this._setupDone.read(reader)) { return undefined; }

		const indicator = this._indicator.read(reader);
		if (!indicator || !indicator.isVisible.read(reader)) { return undefined; }

		return model.inlineEdit.inlineCompletion.identity.id;
	});

	constructor(
		private readonly _model: IObservable<ModelPerInlineEdit | undefined>,
		private readonly _indicator: IObservable<InlineEditsGutterIndicator | undefined>,
		private readonly _collapsedView: InlineEditsCollapsedView,
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._register(this._initializeDebugSetting());

		// Setup the onboarding experience for new users
		this._disposables.value = this.setupNewUserExperience();

		this._setupDone.set(true, undefined);
	}

	private setupNewUserExperience(): IDisposable | undefined {
		if (this.getNewUserType() === UserKind.Active) {
			return undefined;
		}

		const disposableStore = new DisposableStore();

		let userHasHoveredOverIcon = false;
		let inlineEditHasBeenAccepted = false;
		let firstTimeUserAnimationCount = 0;
		let secondTimeUserAnimationCount = 0;

		// pulse animation for new users
		disposableStore.add(runOnChangeWithCancellationToken(this._activeCompletionId, async (id, _, __, token) => {
			if (id === undefined) { return; }
			let userType = this.getNewUserType();

			// User Kind Transition
			switch (userType) {
				case UserKind.FirstTime: {
					if (firstTimeUserAnimationCount++ >= 5 || userHasHoveredOverIcon) {
						userType = UserKind.SecondTime;
						this.setNewUserType(userType);
					}
					break;
				}
				case UserKind.SecondTime: {
					if (secondTimeUserAnimationCount++ >= 3 && inlineEditHasBeenAccepted) {
						userType = UserKind.Active;
						this.setNewUserType(userType);
					}
					break;
				}
			}

			// Animation
			switch (userType) {
				case UserKind.FirstTime: {
					for (let i = 0; i < 3 && !token.isCancellationRequested; i++) {
						await this._indicator.get()?.triggerAnimation();
						await timeout(500);
					}
					break;
				}
				case UserKind.SecondTime: {
					this._indicator.get()?.triggerAnimation();
					break;
				}
			}
		}));

		disposableStore.add(autorun(reader => {
			if (this._collapsedView.isVisible.read(reader)) {
				if (this.getNewUserType() !== UserKind.Active) {
					this._collapsedView.triggerAnimation();
				}
			}
		}));

		// Remember when the user has hovered over the icon
		disposableStore.add(autorun((reader) => {
			const indicator = this._indicator.read(reader);
			if (!indicator) { return; }
			reader.store.add(runOnChange(indicator.isHoveredOverIcon, async (isHovered) => {
				if (isHovered) {
					userHasHoveredOverIcon = true;
				}
			}));
		}));

		// Remember when the user has accepted an inline edit
		disposableStore.add(autorun((reader) => {
			const model = this._model.read(reader);
			if (!model) { return; }
			reader.store.add(model.onDidAccept(() => {
				inlineEditHasBeenAccepted = true;
			}));
		}));

		return disposableStore;
	}

	private getNewUserType(): UserKind {
		return this._storageService.get('inlineEditsGutterIndicatorUserKind', StorageScope.APPLICATION, UserKind.FirstTime) as UserKind;
	}

	private setNewUserType(value: UserKind): void {
		switch (value) {
			case UserKind.FirstTime:
				throw new BugIndicatingError('UserKind should not be set to first time');
			case UserKind.SecondTime:
				break;
			case UserKind.Active:
				this._disposables.clear();
				break;
		}

		this._storageService.store('inlineEditsGutterIndicatorUserKind', value, StorageScope.APPLICATION, StorageTarget.USER);
	}

	private _initializeDebugSetting(): IDisposable {
		// Debug setting to reset the new user experience
		const hiddenDebugSetting = 'editor.inlineSuggest.edits.resetNewUserExperience';
		if (this._configurationService.getValue(hiddenDebugSetting)) {
			this._storageService.remove('inlineEditsGutterIndicatorUserKind', StorageScope.APPLICATION);
		}

		const disposable = this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(hiddenDebugSetting) && this._configurationService.getValue(hiddenDebugSetting)) {
				this._storageService.remove('inlineEditsGutterIndicatorUserKind', StorageScope.APPLICATION);
				this._disposables.value = this.setupNewUserExperience();
			}
		});

		return disposable;
	}
}
