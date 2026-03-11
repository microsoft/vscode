/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { DisablementReason, IUpdateService, State, StateType, UpdateType, type State as UpdateState } from '../../../../../platform/update/common/update.js';
import { IBannerItem, IBannerService } from '../../../../services/banner/browser/bannerService.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { TestActivityService, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { type ITestInstantiationService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { UpdateContribution } from '../../browser/update.js';
import { UpdateTooltip } from '../../browser/updateTooltip.js';

class TestUpdateService implements IUpdateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onStateChange = new Emitter<UpdateState>();
	readonly onStateChange = this._onStateChange.event;

	constructor(public state: UpdateState) { }

	setState(state: UpdateState): void {
		this.state = state;
		this._onStateChange.fire(state);
	}

	async checkForUpdates(_explicit: boolean): Promise<void> { }
	async downloadUpdate(_explicit: boolean): Promise<void> { }
	async applyUpdate(): Promise<void> { }
	async quitAndInstall(): Promise<void> { }
	async isLatestVersion(): Promise<boolean | undefined> { return undefined; }
	async _applySpecificUpdate(_packagePath: string): Promise<void> { }
	async setInternalOrg(_internalOrg: string | undefined): Promise<void> { }
}

class TestBannerService implements IBannerService {
	declare readonly _serviceBrand: undefined;

	lastItem: IBannerItem | undefined;
	hiddenIds: string[] = [];

	focus(): void { }
	focusNextAction(): void { }
	focusPreviousAction(): void { }

	hide(id: string): void {
		this.hiddenIds.push(id);

		if (this.lastItem?.id === id) {
			this.lastItem = undefined;
		}
	}

	show(item: IBannerItem): void {
		this.lastItem = item;
	}
}

suite('UpdateContribution', () => {
	const suiteDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: ITestInstantiationService;
	let updateService: TestUpdateService;
	let bannerService: TestBannerService;
	let registerGlobalActivityActionsStub: sinon.SinonStub;

	setup(() => {
		disposables = suiteDisposables.add(new DisposableStore());
		instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				update: {
					titleBar: 'none'
				}
			})
		}, disposables);

		updateService = new TestUpdateService(State.Disabled(DisablementReason.RunningX64OnArm64));
		bannerService = new TestBannerService();
		registerGlobalActivityActionsStub = sinon.stub(UpdateContribution.prototype as object as { registerGlobalActivityActions(): void }, 'registerGlobalActivityActions').callsFake(() => { });

		instantiationService.stub(IActivityService, new TestActivityService());
		instantiationService.stub(IBannerService, bannerService);
		instantiationService.stub(ICommandService, {
			_serviceBrand: undefined,
			onWillExecuteCommand: Event.None,
			onDidExecuteCommand: Event.None,
			executeCommand: async () => undefined
		});
		instantiationService.stub(IMeteredConnectionService, {
			_serviceBrand: undefined,
			isConnectionMetered: false,
			onDidChangeIsConnectionMetered: Event.None
		});
		instantiationService.stub(IOpenerService, NullOpenerService);
		instantiationService.stub(IProductService, {
			...TestProductService,
			_serviceBrand: undefined,
			nameLong: 'Visual Studio Code',
			nameShort: 'VS Code',
			quality: 'stable',
			target: 'user',
			updateUrl: 'https://update.code.visualstudio.com/api/update',
			version: '1.99.0'
		});
		instantiationService.stub(IUpdateService, updateService);
	});

	teardown(() => {
		registerGlobalActivityActionsStub.restore();
		disposables.clear();
	});

	test('shows an ARM64 guidance banner when updates are disabled for x64-on-ARM64', () => {
		disposables.add(instantiationService.createInstance(UpdateContribution));

		assert.strictEqual(bannerService.lastItem?.id, 'update.architectureMismatch');
		assert.strictEqual(bannerService.lastItem?.actions?.[0].href, 'https://update.code.visualstudio.com/1.99.0/win32-arm64-user/stable');
		assert.match(String(bannerService.lastItem?.message), /ARM64 Windows/);
	});

	test('hides the guidance banner when the update state changes away from the architecture mismatch', () => {
		disposables.add(instantiationService.createInstance(UpdateContribution));

		updateService.setState(State.Idle(UpdateType.Setup));

		assert.strictEqual(bannerService.lastItem, undefined);
		assert.ok(bannerService.hiddenIds.includes('update.architectureMismatch'));
	});

	test('renders a disabled tooltip message for the architecture mismatch reason', () => {
		const tooltip = disposables.add(instantiationService.createInstance(UpdateTooltip));

		assert.strictEqual(updateService.state.type, StateType.Disabled);
		assert.match(tooltip.domNode.textContent ?? '', /Install the ARM64 build to receive updates again\./);
	});
});
