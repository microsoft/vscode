/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isLinux } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChatSessionFileChange2 } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionFileChange } from '../../../../../services/sessions/common/session.js';
import { createChangesets, filterChangesToPrimaryWorkingDirectory, IAgentHostChangeset } from '../../browser/agentHostSessionChangesets.js';
import { IAgentHostAdapterOptions } from '../../browser/baseAgentHostSessionsProvider.js';

suite('AgentHostSessionChangesets', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// Fixtures mirror what `changesetFileToChange` produces: an
	// `IChatSessionFileChange2` whose `uri` always identifies the file (even for
	// deletions, where `modifiedUri` is absent).
	function makeChange(uri: string, modifiedUri: string | undefined = uri): ISessionFileChange {
		return {
			uri: URI.parse(uri),
			modifiedUri: modifiedUri === undefined ? undefined : URI.parse(modifiedUri),
			originalUri: undefined,
			insertions: 1,
			deletions: 0,
		} satisfies IChatSessionFileChange2;
	}

	// A deletion genuinely omits `modifiedUri` (the file no longer exists), so it
	// is identified solely by `uri`. `makeChange(uri, undefined)` cannot express
	// this because the `= uri` default fires for an `undefined` argument.
	function makeDeletion(uri: string): ISessionFileChange {
		return {
			uri: URI.parse(uri),
			modifiedUri: undefined,
			originalUri: URI.parse(uri),
			insertions: 0,
			deletions: 1,
		} satisfies IChatSessionFileChange2;
	}

	function uris(changes: readonly ISessionFileChange[]): string[] {
		return changes.map(change => (change as IChatSessionFileChange2).uri.toString());
	}

	suite('filterChangesToPrimaryWorkingDirectory', () => {
		test('(a) multi-root: keeps only changes under the primary working directory', () => {
			const changes = [
				makeChange('file:///repo/primary/src/a.ts'),
				makeChange('file:///repo/primary/deep/nested/b.ts'),
				makeChange('file:///repo/other/c.ts'),
			];

			const result = filterChangesToPrimaryWorkingDirectory(changes, ['file:///repo/primary', 'file:///repo/other']);

			assert.deepStrictEqual(uris(result), [
				'file:///repo/primary/src/a.ts',
				'file:///repo/primary/deep/nested/b.ts',
			]);
		});

		test('(b) single-root: returns the input list unchanged (same reference)', () => {
			const changes = [
				makeChange('file:///repo/primary/a.ts'),
				makeChange('file:///repo/other/b.ts'),
			];

			assert.strictEqual(filterChangesToPrimaryWorkingDirectory(changes, ['file:///repo/primary']), changes);
		});

		test('(b) undefined working directories: returns the input list unchanged', () => {
			const changes = [makeChange('file:///repo/primary/a.ts')];

			assert.strictEqual(filterChangesToPrimaryWorkingDirectory(changes, undefined), changes);
		});

		test('(b) empty working directories: returns the input list unchanged', () => {
			const changes = [makeChange('file:///repo/primary/a.ts')];

			assert.strictEqual(filterChangesToPrimaryWorkingDirectory(changes, []), changes);
		});

		test('(c) boundary: a change exactly at the primary directory is kept; a sibling with a shared prefix is excluded', () => {
			const changes = [
				makeChange('file:///repo/primary'),
				makeChange('file:///repo/primary/x.ts'),
				makeChange('file:///repo/primary-sibling/y.ts'),
			];

			const result = filterChangesToPrimaryWorkingDirectory(changes, ['file:///repo/primary', 'file:///repo/second']);

			assert.deepStrictEqual(uris(result), [
				'file:///repo/primary',
				'file:///repo/primary/x.ts',
			]);
		});

		test('deletions (no modifiedUri) are classified by their file uri', () => {
			const changes = [
				makeDeletion('file:///repo/primary/gone.ts'),
				makeDeletion('file:///repo/other/gone.ts'),
			];

			// Guard the fixture itself: a real deletion must omit `modifiedUri`.
			assert.strictEqual((changes[0] as IChatSessionFileChange2).modifiedUri, undefined);

			const result = filterChangesToPrimaryWorkingDirectory(changes, ['file:///repo/primary', 'file:///repo/other']);

			assert.deepStrictEqual(uris(result), ['file:///repo/primary/gone.ts']);
		});

		test('compares mapped (agent-host) changes by their preserved file path', () => {
			// Simulates a remote provider: changes have already been mapped
			// (`file:` -> `agent-host:`) while the working directories remain the
			// host's raw `file:` URIs. The path is preserved through the mapping, so
			// the in-scope change still matches without any mapper being threaded in.
			const changes = [
				makeChange('agent-host://server/repo/primary/a.ts'),
				makeChange('agent-host://server/repo/other/b.ts'),
			];

			const result = filterChangesToPrimaryWorkingDirectory(changes, ['file:///repo/primary', 'file:///repo/other']);

			assert.deepStrictEqual(uris(result), ['agent-host://server/repo/primary/a.ts']);
		});

		test('case-differing sibling roots are not conflated (file-path case semantics)', () => {
			// A change under `/repo/app` must NOT be treated as under the primary
			// `/repo/App`. Comparing on the `file:` scheme keeps platform case
			// semantics rather than the case-insensitive bias applied to non-`file:`
			// schemes. (Assertion holds on case-sensitive platforms.)
			if (isLinux) {
				const changes = [makeChange('agent-host://server/repo/app/x.ts')];

				const result = filterChangesToPrimaryWorkingDirectory(changes, ['file:///repo/App', 'file:///repo/other']);

				assert.deepStrictEqual(uris(result), []);
			}
		});
	});

	suite('createChangesets default selection', () => {
		const sessionUri = URI.parse('ahp-session:/session-1');

		/** Kinds whose advertised template carries RFC 6570 variables. */
		const TEMPLATED_KINDS: Record<string, string> = {
			turn: 'changeset/turn/{turnId}',
			'compare-turns': 'changeset/compare-turns/{originalTurnId}/{modifiedTurnId}',
		};

		function entry(changeKind: string): IAgentHostChangeset {
			return {
				label: changeKind,
				changeKind,
				uriTemplate: TEMPLATED_KINDS[changeKind] ?? `changeset/${changeKind}`,
			};
		}

		/** Each surviving changeset as `<changeKind>`, with `*` marking the default. */
		function selectDefault(changeKinds: readonly string[], defaultChangesetKind?: IAgentHostAdapterOptions['defaultChangesetKind']): string[] {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });

			const options: IAgentHostAdapterOptions = {
				icon: Codicon.copilot,
				loading: constObservable(false),
				buildWorkspace: () => undefined,
				instantiationService,
				getConnection: () => undefined,
				agentCapabilities: constObservable(undefined),
				mapBackendSessionResource: resource => resource,
				defaultChangesetKind,
			};

			return createChangesets(sessionUri, options, constObservable(false), changeKinds.map(entry))
				.map(changeset => `${changeset.id}${changeset.isDefault.get() ? '*' : ''}`);
		}

		/** The catalogue a Copilot host advertises for a git-backed session. */
		const gitBackedCatalogue = ['session', 'branch', 'uncommitted', 'all', 'turn', 'compare-turns'];

		test('a host that asks for `session` gets it, over the `branch` it also advertises', () => {
			assert.deepStrictEqual(
				selectDefault(gitBackedCatalogue, ChangesetKind.Session),
				['session*', 'branch', 'uncommitted', 'turn']);
		});

		test('the same catalogue without a declared preference keeps the `branch` default', () => {
			assert.deepStrictEqual(
				selectDefault(gitBackedCatalogue),
				['session', 'branch*', 'uncommitted', 'turn']);
		});

		test('a git catalogue from a host with no preference defaults to `branch`', () => {
			assert.deepStrictEqual(
				selectDefault(['branch', 'uncommitted', 'session', 'turn', 'compare-turns']),
				['branch*', 'uncommitted', 'session', 'turn']);
		});

		test('a declared preference the catalogue does not advertise falls back to the first entry', () => {
			assert.deepStrictEqual(
				selectDefault(['session', 'branch', 'turn'], ChangesetKind.Uncommitted),
				['session*', 'branch', 'turn']);
		});

		test('a non-git catalogue defaults to `session` with or without a preference', () => {
			assert.deepStrictEqual(
				[selectDefault(['session', 'turn']), selectDefault(['session', 'turn'], ChangesetKind.Session)],
				[['session*', 'turn'], ['session*', 'turn']]);
		});

		test('a session still being created defaults to its only entry', () => {
			assert.deepStrictEqual(
				selectDefault(['uncommitted'], ChangesetKind.Session),
				['uncommitted*']);
		});
	});
});
