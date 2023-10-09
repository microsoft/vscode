/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { GLOBAL_ACTIVITY_ID, IActivity, ACCOUNTS_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { GlobalActivityActionViewItem, AccountsActivityActionViewItem } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { IBadge, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, toDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { IColorTheme } from 'vs/platform/theme/common/themeService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ActivityAction, IActivityHoverOptions, ICompositeActivity, ICompositeBarColors } from 'vs/workbench/browser/parts/compositeBarActions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { DEFAULT_ICON } from 'vs/workbench/services/userDataProfile/common/userDataProfileIcons';
import { IAction, toAction } from 'vs/base/common/actions';

export class GlobalCompositeBar extends Disposable {

	private static readonly ACCOUNTS_ACTION_INDEX = 0;
	private static readonly ACCOUNTS_ICON = registerIcon('accounts-view-bar-icon', Codicon.account, localize('accountsViewBarIcon', "Accounts icon in the view bar."));

	readonly element: HTMLElement;
	private readonly globalActivityActionBar: ActionBar;
	private readonly globalActivityAction: ActivityAction;
	private readonly globalActivity: ICompositeActivity[] = [];

	private accountsActivityAction: ActivityAction | undefined;
	private readonly accountsActivity: ICompositeActivity[] = [];

	constructor(
		private readonly contextMenuActionsProvider: () => IAction[],
		private readonly colors: (theme: IColorTheme) => ICompositeBarColors,
		private readonly activityHoverOptions: IActivityHoverOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
	) {
		super();

		this.element = document.createElement('div');
		this.globalActivityActionBar = this._register(new ActionBar(this.element, {
			actionViewItemProvider: action => {
				if (action.id === 'workbench.actions.manage') {
					return this.instantiationService.createInstance(GlobalActivityActionViewItem, action as ActivityAction, this.contextMenuActionsProvider, this.colors, this.activityHoverOptions);
				}

				if (action.id === 'workbench.actions.accounts') {
					return this.instantiationService.createInstance(AccountsActivityActionViewItem, action as ActivityAction, this.contextMenuActionsProvider, this.colors, this.activityHoverOptions);
				}

				throw new Error(`No view item for action '${action.id}'`);
			},
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: localize('manage', "Manage"),
			animated: false,
			preventLoopNavigation: true
		}));

		this.globalActivityAction = this._register(new ActivityAction(this.createGlobalActivity()));
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => {
			if (this.globalActivityAction) {
				this.globalActivityAction.activity = this.createGlobalActivity();
			}
		}));

		if (this.accountsVisibilityPreference) {
			this.accountsActivityAction = this._register(new ActivityAction({
				id: 'workbench.actions.accounts',
				name: localize('accounts', "Accounts"),
				classNames: ThemeIcon.asClassNameArray(GlobalCompositeBar.ACCOUNTS_ICON)
			}));

			this.globalActivityActionBar.push(this.accountsActivityAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
		}

		this.globalActivityActionBar.push(this.globalActivityAction);

		this.registerListeners();
	}

	private registerListeners(): void {
		// Extension registration
		const disposables = this._register(new DisposableStore());
		this._register(this.extensionService.onDidRegisterExtensions(() => {
			this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, disposables)(() => this.toggleAccountsActivity(), this, disposables);
		}));
	}

	showActivity(viewContainerOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable | undefined {
		if (viewContainerOrActionId === GLOBAL_ACTIVITY_ID) {
			return this.showGlobalActivity(GLOBAL_ACTIVITY_ID, badge, clazz, priority);
		}

		if (viewContainerOrActionId === ACCOUNTS_ACTIVITY_ID) {
			return this.showGlobalActivity(ACCOUNTS_ACTIVITY_ID, badge, clazz, priority);
		}

		return undefined;
	}

	private showGlobalActivity(activityId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		if (typeof priority !== 'number') {
			priority = 0;
		}

		const activity: ICompositeActivity = { badge, clazz, priority };
		const activityCache = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivity : this.accountsActivity;

		for (let i = 0; i <= activityCache.length; i++) {
			if (i === activityCache.length) {
				activityCache.push(activity);
				break;
			} else if (activityCache[i].priority <= priority) {
				activityCache.splice(i, 0, activity);
				break;
			}
		}
		this.updateGlobalActivity(activityId);

		return toDisposable(() => this.removeGlobalActivity(activityId, activity));
	}

	private removeGlobalActivity(activityId: string, activity: ICompositeActivity): void {
		const activityCache = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivity : this.accountsActivity;
		const index = activityCache.indexOf(activity);
		if (index !== -1) {
			activityCache.splice(index, 1);
			this.updateGlobalActivity(activityId);
		}
	}

	private updateGlobalActivity(activityId: string): void {
		const activityAction = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivityAction : this.accountsActivityAction;
		if (!activityAction) {
			return;
		}

		const activityCache = activityId === GLOBAL_ACTIVITY_ID ? this.globalActivity : this.accountsActivity;
		if (activityCache.length) {
			const [{ badge, clazz, priority }] = activityCache;
			if (badge instanceof NumberBadge && activityCache.length > 1) {
				const cumulativeNumberBadge = this.getCumulativeNumberBadge(activityCache, priority);
				activityAction.setBadge(cumulativeNumberBadge);
			} else {
				activityAction.setBadge(badge, clazz);
			}
		} else {
			activityAction.setBadge(undefined);
		}
	}

	private getCumulativeNumberBadge(activityCache: ICompositeActivity[], priority: number): NumberBadge {
		const numberActivities = activityCache.filter(activity => activity.badge instanceof NumberBadge && activity.priority === priority);
		const number = numberActivities.reduce((result, activity) => { return result + (<NumberBadge>activity.badge).number; }, 0);
		const descriptorFn = (): string => {
			return numberActivities.reduce((result, activity, index) => {
				result = result + (<NumberBadge>activity.badge).getDescription();
				if (index < numberActivities.length - 1) {
					result = `${result}\n`;
				}

				return result;
			}, '');
		};

		return new NumberBadge(number, descriptorFn);
	}

	create(parent: HTMLElement): void {
		parent.appendChild(this.element);
	}

	focus(): void {
		this.globalActivityActionBar.focus(true);
	}

	size(): number {
		return this.globalActivityActionBar.viewItems.length;
	}

	getContextMenuActions(): IAction[] {
		return [toAction({ id: 'toggleAccountsVisibility', label: localize('accounts', "Accounts"), checked: this.accountsVisibilityPreference, run: () => this.accountsVisibilityPreference = !this.accountsVisibilityPreference })];
	}

	private createGlobalActivity(): IActivity {
		return {
			id: 'workbench.actions.manage',
			name: localize('manage', "Manage"),
			classNames: ThemeIcon.asClassNameArray(this.userDataProfileService.currentProfile.icon ? ThemeIcon.fromId(this.userDataProfileService.currentProfile.icon) : DEFAULT_ICON),
		};
	}

	private toggleAccountsActivity() {
		if (!!this.accountsActivityAction === this.accountsVisibilityPreference) {
			return;
		}
		if (this.globalActivityActionBar) {
			if (this.accountsActivityAction) {
				this.globalActivityActionBar.pull(GlobalCompositeBar.ACCOUNTS_ACTION_INDEX);
				this.accountsActivityAction = undefined;
			} else {
				this.accountsActivityAction = this._register(new ActivityAction({
					id: 'workbench.actions.accounts',
					name: localize('accounts', "Accounts"),
					classNames: ThemeIcon.asClassNameArray(Codicon.account)
				}));
				this.globalActivityActionBar.push(this.accountsActivityAction, { index: GlobalCompositeBar.ACCOUNTS_ACTION_INDEX });
			}
		}

		this.updateGlobalActivity(ACCOUNTS_ACTIVITY_ID);
	}

	private get accountsVisibilityPreference(): boolean {
		return this.storageService.getBoolean(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, StorageScope.PROFILE, true);
	}

	private set accountsVisibilityPreference(value: boolean) {
		this.storageService.store(AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
	}
}
