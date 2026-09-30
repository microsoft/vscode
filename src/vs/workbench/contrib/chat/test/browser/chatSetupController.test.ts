/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressService, IProgressStep, IProgressWindowOptions } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, IChatEntitlementContextState } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatSetupController } from '../../browser/chatSetup/chatSetupController.js';

suite('ChatSetupController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cancels while waiting for browser sign-in', async () => {
		const signInStarted = new DeferredPromise<void>();
		const pendingSignIn = new DeferredPromise<Awaited<ReturnType<ChatEntitlementRequests['signIn']>>>();
		const context = new class extends mock<ChatEntitlementContext>() {
			override readonly onDidChange = Event.None;
			override get state(): IChatEntitlementContextState {
				return {
					entitlement: ChatEntitlement.Unknown,
					sku: undefined,
					organisations: undefined,
					isStaff: undefined,
					copilotTrackingId: undefined,
				};
			}
			override suspend(): void { }
			override resume(): void { }
		}();
		const requests = new class extends mock<ChatEntitlementRequests>() {
			override signIn(): Promise<Awaited<ReturnType<ChatEntitlementRequests['signIn']>>> {
				signInStarted.complete();
				return pendingSignIn.p;
			}
		}();
		const extensionsWorkbenchService = new class extends mock<IExtensionsWorkbenchService>() {
			override get local() { return []; }
		}();
		const progressService = new class extends mock<IProgressService>() {
			override withProgress<R>(
				_options: IProgressOptions | IProgressDialogOptions | IProgressNotificationOptions | IProgressWindowOptions | IProgressCompositeOptions,
				task: (progress: IProgress<IProgressStep>) => Promise<R>
			): Promise<R> {
				return task({ report() { } });
			}
		}();
		const activityService = new class extends mock<IActivityService>() {
			override showViewContainerActivity() { return Disposable.None; }
		}();
		const cancellation = disposables.add(new CancellationTokenSource());
		const controller = disposables.add(new ChatSetupController(
			context,
			requests,
			new NullTelemetryServiceShape(),
			extensionsWorkbenchService,
			new NullLogService(),
			progressService,
			activityService,
			new class extends mock<ICommandService>() { }(),
			new class extends mock<IDialogService>() { }(),
			new class extends mock<IConfigurationService>() { }(),
			new class extends mock<ILifecycleService>() { }(),
			new class extends mock<IQuickInputService>() { }(),
			new class extends mock<IDefaultAccountService>() { }(),
			new class extends mock<IProductService>() { }(),
		));

		const resultPromise = controller.setup({ forceSignIn: true, cancellationToken: cancellation.token });
		await signInStarted.p;
		cancellation.cancel();
		const result = await resultPromise;
		pendingSignIn.complete({});

		assert.strictEqual(result, undefined);
	});
});
