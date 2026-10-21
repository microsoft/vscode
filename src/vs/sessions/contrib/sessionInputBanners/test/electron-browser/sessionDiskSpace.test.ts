/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISession, ISessionGitRepository, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktreeCleanupService } from '../../browser/sessionWorktreeCleanupService.js';
import { SessionDiskSpaceContribution } from '../../electron-browser/sessionDiskSpace.contribution.js';

suite('SessionDiskSpaceContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create(options: {
		paths?: readonly URI[];
		enabled?: boolean;
		hidden?: boolean;
		getFreeDiskSpace?: (path: string) => Promise<number>;
	} = {}) {
		const checks: string[] = [];
		const warnings: string[] = [];
		const availableSpace: (number | undefined)[] = [];
		const configuration = new TestConfigurationService({ [AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: options.enabled ?? true });
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const paths = options.paths ?? [URI.file('/worktree')];
		const contribution = disposables.add(new SessionDiskSpaceContribution(
			upcastPartial<ISessionsManagementService>({
				getSessions: () => paths.map(path => upcastPartial<ISession>({
					workspace: constObservable(upcastPartial<ISessionWorkspace>({
						folders: [{
							root: path,
							workingDirectory: path,
							name: 'worktree',
							description: undefined,
							gitRepository: upcastPartial<ISessionGitRepository>({ workTreeUri: path }),
						}],
					})),
				})),
				onDidChangeSessions: Event.None,
			}),
			upcastPartial<INativeHostService>({
				getFreeDiskSpace: async path => {
					checks.push(path);
					return options.getFreeDiskSpace ? options.getFreeDiskSpace(path) : ByteSize.GB;
				},
			}),
			upcastPartial<ISessionWorktreeCleanupService>({
				setAvailableDiskSpace: bytes => availableSpace.push(bytes),
			}),
			configuration,
			upcastPartial<IChatEntitlementService>({ sentiment: { hidden: options.hidden ?? false } }),
			upcastPartial<ILogService>({ warn: message => warnings.push(message) }),
		));
		return { contribution, configuration, checks, warnings, availableSpace };
	}

	test('passes low disk space to the existing cleanup suggestion service', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { contribution, checks, availableSpace } = create();
		await timeout(10_001);
		contribution.dispose();

		assert.deepStrictEqual({ checks, availableSpace }, {
			checks: [URI.file('/worktree').fsPath],
			availableSpace: [ByteSize.GB],
		});
	}));

	for (const available of [0, 5 * ByteSize.GB - 1, 5 * ByteSize.GB, 10 * ByteSize.GB]) {
		test(`checks the low-space boundary with ${available} bytes available`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { contribution, availableSpace } = create({ getFreeDiskSpace: async () => available });
			await timeout(10_001);
			contribution.dispose();
			assert.deepStrictEqual(availableSpace, [available < 5 * ByteSize.GB ? available : undefined]);
		}));
	}

	for (const options of [{ paths: [] }, { paths: [URI.parse('vscode-remote://host/worktree')] }, { enabled: false }, { hidden: true }]) {
		test(`does not check or warn when ${JSON.stringify(options)}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { contribution, checks, availableSpace } = create(options);
			await timeout(10_001);
			contribution.dispose();
			assert.deepStrictEqual({ checks, availableSpace }, { checks: [], availableSpace: [undefined] });
		}));
	}

	test('periodically detects a disk becoming full without a session change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let available = 10 * ByteSize.GB;
		const { contribution, checks, availableSpace } = create({ getFreeDiskSpace: async () => available });
		await timeout(10_001);
		available = ByteSize.GB;
		await timeout(5 * 60 * 1000);
		contribution.dispose();
		assert.deepStrictEqual({ checks: checks.length, availableSpace }, { checks: 2, availableSpace: [undefined, ByteSize.GB] });
	}));

	test('clears the low-space suggestion when space is recovered', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let available = ByteSize.GB;
		const { contribution, availableSpace } = create({ getFreeDiskSpace: async () => available });
		await timeout(10_001);
		available = 10 * ByteSize.GB;
		await timeout(5 * 60 * 1000);
		contribution.dispose();
		assert.deepStrictEqual(availableSpace, [ByteSize.GB, undefined]);
	}));

	test('deduplicates paths and continues after an inaccessible worktree', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const missing = URI.file('/missing');
		const full = URI.file('/full');
		const { contribution, checks, warnings, availableSpace } = create({
			paths: [missing, missing, full],
			getFreeDiskSpace: async path => {
				if (path === missing.fsPath) {
					throw new Error('Worktree no longer exists');
				}
				return ByteSize.GB;
			},
		});
		await timeout(10_001);
		contribution.dispose();
		assert.deepStrictEqual({ checks, warnings, availableSpace }, {
			checks: [missing.fsPath, full.fsPath],
			warnings: ['[SessionDiskSpace] Failed to check worktree disk space'],
			availableSpace: [ByteSize.GB],
		});
	}));

	test('does not notify when suggestions are disabled during a check', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { contribution, configuration, availableSpace } = create({
			getFreeDiskSpace: async () => {
				await configuration.setUserConfiguration(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, false);
				return ByteSize.GB;
			},
		});
		await timeout(10_001);
		contribution.dispose();
		assert.deepStrictEqual(availableSpace, []);
	}));
});
