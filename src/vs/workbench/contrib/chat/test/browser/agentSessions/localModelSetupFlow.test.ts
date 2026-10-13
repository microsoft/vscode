/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeLocalModelConsentScope, type ILocalModelFamilyV1, type ILocalModelStatusV1 } from '../../../../../../platform/agentHost/common/localModel.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { LocalModelService } from '../../../../../services/agentHost/browser/localModelService.js';
import { buildLocalModelRuntimeApproval, buildLocalModelSetUpConsent, getLocalModelRuntimeApprovalConsent, getLocalModelSetUpAgreement, LocalModelSetupFlow } from '../../../browser/agentSessions/agentHost/localModelSetupFlow.js';
import { createStatus, installedFamily, offeredFamily, otherFamily, ScriptedDialogService, TestLocalModelConnection } from './localModelTestUtils.js';

const KEEP_WORKING = 'You can keep using Copilot while it downloads.';

suite('LocalModelSetupFlow', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	/** The download consent of `family`'s detail page, and what agreeing to it sends. */
	function consentOf(status: ILocalModelStatusV1, family: ILocalModelFamilyV1) {
		const consent = buildLocalModelSetUpConsent(status, family);
		return {
			kind: consent.kind,
			title: consent.title,
			details: consent.details,
			license: consent.license,
			buttons: consent.buttons.map(button => button.label),
			agreements: consent.buttons.map(() => getLocalModelSetUpAgreement(family)),
		};
	}

	suite('download consent covers only the model', () => {
		test('approved llama.cpp and model files on the device: Set Up, nothing downloaded', () => {
			const family: ILocalModelFamilyV1 = { ...offeredFamily, entry: { modelFilesPresent: true } };
			const status = createStatus([family], { runtime: { source: 'packageManager', version: 'b11459', trust: 'userApproved' } });
			assert.deepStrictEqual(consentOf(status, family), {
				kind: 'consent',
				title: 'Set Up',
				details: ['Uses Example Flash 1.0, which is already on this device.'],
				license: undefined,
				buttons: ['Set Up'],
				agreements: [{ consent: { scope: computeLocalModelConsentScope({ family }) }, entryPath: 'none' }],
			});
		});

		test('no llama.cpp and nothing on the device: Download says loading needs llama.cpp, which VS Code doesn\'t install; it says nothing about Auto or local model safety', () => {
			assert.deepStrictEqual(consentOf(createStatus([offeredFamily], { useInAuto: false }), offeredFamily), {
				kind: 'consent',
				title: 'Download',
				details: [
					'Download size: 56.7 GB. Free space needed during setup: 57.2 GB on C:.',
					'Source: Azure ML registry. License: MIT.',
					'Stored in ~/.copilot/azureml-models and shared with other Copilot apps.',
					'Loading Example Flash 1.0 needs llama.cpp, which VS Code doesn\'t install. You can get it while the model downloads.',
					KEEP_WORKING,
				],
				license: { name: 'MIT', url: 'https://example.com/license' },
				buttons: ['Download'],
				agreements: [{ consent: { scope: computeLocalModelConsentScope({ family: offeredFamily }) }, entryPath: 'modelOnly' }],
			});
		});

		test('the consent is the same whatever llama.cpp is found (none, awaiting approval, unsupported): the scope never covers it', () => {
			const family: ILocalModelFamilyV1 = { ...offeredFamily, entry: { modelFilesPresent: true } };
			const pending = consentOf(createStatus([family], { runtime: { source: 'path', version: 'b11459', trust: 'pendingApproval', path: 'C:\\tools\\llama\\llama-server.exe' } }), family);
			const none = consentOf(createStatus([family]), family);
			assert.deepStrictEqual({ pending, sameAsNone: JSON.stringify(pending) === JSON.stringify(none) }, {
				pending: {
					kind: 'consent',
					title: 'Set Up',
					details: ['Uses Example Flash 1.0, which is already on this device.', 'Loading Example Flash 1.0 needs llama.cpp, which VS Code doesn\'t install.'],
					license: undefined,
					buttons: ['Set Up'],
					agreements: [{ consent: { scope: computeLocalModelConsentScope({ family }) }, entryPath: 'none' }],
				},
				sameAsNone: true,
			});
		});

		test('the download can\'t start without enough disk space (no button)', () => {
			const tooBig: ILocalModelFamilyV1 = { ...offeredFamily, entry: { modelFilesPresent: false, disk: { volume: 'C:', availableBytes: 10 * 1024 ** 3, requiredBytes: 60 * 1024 ** 3 } } };
			const { kind, title, details, buttons } = consentOf(createStatus([tooBig]), tooBig);
			assert.deepStrictEqual({ kind, title, details, buttons }, {
				kind: 'notEnoughDisk',
				title: 'Not Enough Disk Space',
				details: ['Not enough free space on C: (10.0 GB available, 60.0 GB needed).', 'Free up space on C:, then download Example Flash 1.0 again.'],
				buttons: [],
			});
		});
	});

	test('near fit families say so', () => {
		const family: ILocalModelFamilyV1 = {
			...offeredFamily,
			autoCapable: false,
			offer: { ...offeredFamily.offer!, fit: 'near', requiredGpuBytes: 72 * 1024 ** 3, licenseName: undefined, licenseUrl: undefined },
			entry: { modelFilesPresent: false },
		};
		const consent = buildLocalModelSetUpConsent(createStatus([family], { runtime: { source: 'env', trust: 'userApproved' } }), family);
		assert.deepStrictEqual({ details: consent.details, license: consent.license, entryPath: consent.entryPath }, {
			details: [
				'Download size: 56.7 GB. Free space needed during setup: 57.2 GB.',
				'Source: Azure ML registry.',
				'Stored in ~/.copilot/azureml-models and shared with other Copilot apps.',
				'This device has about 67.2 GB of GPU memory; the model needs about 72.0 GB. Part of it will run from system memory, so responses may be slower.',
				KEEP_WORKING,
			],
			license: undefined,
			entryPath: 'modelOnly',
		});
	});
	test('loading another model asks nothing; Stop Now and Remove stay confirmations that show usage counts and gate the requests', async () => {
		const connection = new TestLocalModelConnection();
		disposables.add({ dispose: () => connection.dispose() });
		const active: ILocalModelFamilyV1 = { ...otherFamily, usage: { runningStreams: 2, boundDirectChats: 2, liveAutoRoutes: 1 } };
		connection.setStatus(createStatus([installedFamily, active], { active: { familyId: active.familyId, contentId: 'q1', servingGeneration: 1, server: 'ready', drain: { runningStreams: 2 } } }));
		const service = disposables.add(new LocalModelService(connection, new TestConfigurationService(), new NullLogService()));
		const dialogs = new ScriptedDialogService();
		disposables.add(service.registerInteractionHandler(new LocalModelSetupFlow(dialogs)));
		dialogs.answers.push(false, true, false);
		const results = [
			service.makeActive(connection, installedFamily.familyId),
			await service.stopNow(connection),
			await service.remove(connection, active.familyId),
			await service.remove(connection, installedFamily.familyId),
		];
		assert.deepStrictEqual({
			results,
			dialogs: dialogs.shown.map(dialog => `${dialog.message} | ${dialog.detail} | ${dialog.buttons.join(',')}`),
			requests: connection.requests,
		}, {
			results: [true, false, true, false],
			dialogs: [
				'Stop 2 running responses? | They will end without finishing. | Stop Now',
				'Remove Example Coder? | 3 chats are using it. Running responses will finish first.\n\nIts model files are deleted from this device. | Remove',
				'Remove Example Flash 1.0? | Its model files are deleted from this device. | Remove',
			],
			requests: [
				{ action: 'makeActive', familyId: installedFamily.familyId },
				{ action: 'remove', familyId: active.familyId },
			],
		});
	});

	suite('runtime approval', () => {
		test('names the detected llama.cpp by path, version and short runtime digest, and binds the consent to exactly that status', () => {
			const sha256 = '0123456789abcdef'.repeat(4);
			const withDigest = createStatus([installedFamily], { runtime: { source: 'path', version: 'b11459', trust: 'pendingApproval', path: '/opt/homebrew/bin/llama-server', sha256, size: 4096 } });
			const noVersion = createStatus([installedFamily], { runtime: { source: 'path', trust: 'pendingApproval', path: 'C:\\tools\\llama-server.exe' } });
			const consent = getLocalModelRuntimeApprovalConsent(withDigest);
			assert.deepStrictEqual({
				withDigest: buildLocalModelRuntimeApproval(withDigest),
				noVersion: buildLocalModelRuntimeApproval(noVersion),
				trusted: buildLocalModelRuntimeApproval(createStatus([installedFamily], { runtime: { source: 'path', trust: 'userApproved', path: 'C:\\tools\\llama-server.exe' } })),
				consent,
				differsFromSwappedFile: consent.scope !== getLocalModelRuntimeApprovalConsent(createStatus([installedFamily], { runtime: { ...withDigest.runtime, sha256: 'f'.repeat(64) } })).scope,
			}, {
				withDigest: {
					message: 'Use llama.cpp found at /opt/homebrew/bin/llama-server (b11459)? Runtime digest 0123456789ab...',
					details: ['VS Code didn\'t install this llama-server. Use it only if you trust it.', 'VS Code runs it to serve on-device models.'],
				},
				noVersion: {
					message: 'Use llama.cpp found at C:\\tools\\llama-server.exe?',
					details: ['VS Code didn\'t install this llama-server. Use it only if you trust it.', 'VS Code runs it to serve on-device models.'],
				},
				trusted: undefined,
				consent: { scope: computeLocalModelConsentScope({ runtime: withDigest.runtime }) },
				differsFromSwappedFile: true,
			});
		});

		test('runtimeChanged: the approval says the approved llama-server changed; the download consent doesn\'t ask about llama.cpp', () => {
			const runtime = { source: 'packageManager', version: 'b11500', trust: 'pendingApproval', path: 'C:\\llama\\llama-server.exe' } as const;
			const changedError = { code: 'runtimeChanged', message: 'The llama-server changed since you approved it.', actions: ['retry'] } as const;
			const failedSetup: ILocalModelFamilyV1 = { ...offeredFamily, entry: { modelFilesPresent: false }, operation: { id: 'op-1', kind: 'setup', state: 'error', resumeOnStartup: true, error: changedError } };
			const setup = buildLocalModelSetUpConsent(createStatus([failedSetup], { runtime }), failedSetup);
			const approval = buildLocalModelRuntimeApproval(createStatus([installedFamily], { runtime, active: { familyId: installedFamily.familyId, contentId: 'c1', servingGeneration: 1, server: 'error', error: { ...changedError, actions: [] } } }));
			assert.deepStrictEqual({ setup: { line: setup.details[3], buttons: setup.buttons.map(button => button.label) }, approval: approval?.details[0] }, {
				setup: {
					line: 'Loading Example Flash 1.0 needs llama.cpp, which VS Code doesn\'t install. You can get it while the model downloads.',
					buttons: ['Download'],
				},
				approval: 'This llama-server changed since you approved it, so it wasn\'t run. Use it only if you trust it.',
			});
		});
	});
});
