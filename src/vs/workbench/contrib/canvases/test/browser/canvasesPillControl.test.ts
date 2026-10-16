/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { getChatPillEntries } from '../../../../browser/chatPills.js';
import { CanvasesPillControl } from '../../browser/canvasesPillControl.js';
import { ICanvas, ICanvasContext, ICanvasOwner } from '../../common/canvas.js';

suite('CanvasesPillControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const owner: ICanvasOwner = { providerId: 'local/copilotcli', session: URI.parse('ahp-session:/42'), chat: URI.parse('ahp-session:/42/chats/main') };
	const frontendSessionResource = URI.parse('agent-host-copilotcli:/frontend-session');
	const canvas = (instanceId: string, title: string): ICanvas => ({
		resource: URI.parse(`agent-host-canvas:/${title.toLowerCase()}`),
		instanceId,
		title,
		source: URI.parse(`https://example.test/${title.toLowerCase()}`),
	});

	function createControl(context: ICanvasContext) {
		const errors: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [CanvasesEnabledSettingId]: true }));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async () => undefined }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: error => { errors.push(String(error)); } }));
		const control = store.add(instantiationService.createInstance(CanvasesPillControl, observableValue<ICanvasContext | undefined>('context', context)));
		const closeActions = () => getChatPillEntries(control.sections.get()).map(entry => entry.promotedAction);
		return { errors, closeActions };
	}

	test('offers to close each live canvas through its context, once per in-flight request', async () => {
		const gate = new DeferredPromise<void>();
		const closed: string[] = [];
		const preview = canvas('preview', 'Preview');
		const { errors, closeActions } = createControl({
			owner,
			frontendSessionResource,
			canvases: observableValue<readonly ICanvas[] | undefined>('canvases', [preview]),
			closeCanvas: async closing => {
				closed.push(closing.resource.toString());
				await gate.p;
			},
		});
		const [close] = closeActions();
		assert.ok(close);

		const first = close.run();
		const repeated = close.run();
		gate.complete();
		await Promise.all([first, repeated]);
		await close.run();

		assert.deepStrictEqual({
			action: { label: close.label, hoverLabel: close.hoverLabel, icon: close.class },
			closed,
			errors,
		}, {
			action: { label: 'Close Canvas Preview', hoverLabel: 'Close Canvas', icon: ThemeIcon.asClassName(Codicon.close) },
			closed: [preview.resource.toString(), preview.resource.toString()],
			errors: [],
		});
	});

	test('reports a failed close and omits the action when the host cannot close canvases', async () => {
		const canvases = observableValue<readonly ICanvas[] | undefined>('canvases', [canvas('preview', 'Preview')]);
		const failing = createControl({ owner, frontendSessionResource, canvases, closeCanvas: async () => { throw new Error('provider unavailable'); } });
		const unsupported = createControl({ owner, frontendSessionResource, canvases });

		await failing.closeActions()[0]?.run();

		assert.deepStrictEqual({ errors: failing.errors, unsupported: unsupported.closeActions() }, {
			errors: ['Could not close canvas Preview: provider unavailable'],
			unsupported: [undefined],
		});
	});
});
