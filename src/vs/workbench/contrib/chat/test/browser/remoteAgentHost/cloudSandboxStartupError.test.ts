/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isErrorWithActions } from '../../../../../../base/common/errorMessage.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxNetworkError, CloudSandboxRequestError } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CloudSandboxStartupError } from '../../../browser/remoteAgentHost/cloudSandboxStartupError.js';

suite('CloudSandboxStartupError', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const commandService = new class extends mock<ICommandService>() { }();

	for (const { name, error, message } of [
		{ name: 'signed out', error: new CloudSandboxAuthenticationRequiredError(), message: 'Sign in to GitHub to continue.' },
		{ name: 'authentication rejected', error: new CloudSandboxRequestError(401, 'private'), message: 'Sign in to GitHub to continue.' },
		{ name: 'access denied', error: new CloudSandboxRequestError(403, 'private'), message: 'GitHub denied access. Check your repository access and your organization\'s cloud session settings.' },
		{ name: 'unexplained 404', error: new CloudSandboxRequestError(404, 'Resource protected by organization SAML enforcement.'), message: 'GitHub couldn\'t find or allow access to a required resource.' },
		{ name: 'disabled feature', error: new CloudSandboxRequestError(403, 'private', undefined, { code: 'feature_disabled' }), message: 'Cloud sessions are not enabled for this account or organization.' },
		{ name: 'rate limit', error: new CloudSandboxRequestError(429, 'private'), message: 'GitHub is limiting requests. Wait before trying again.' },
		{ name: 'rate limit with wait', error: new CloudSandboxRequestError(403, 'private', 1.2), message: 'GitHub is limiting requests. Wait 2 seconds before trying again.' },
		{ name: 'semantic rate limit', error: new CloudSandboxRequestError(503, 'private', 5, { code: 'rate_limit_exceeded' }), message: 'GitHub is limiting requests. Wait 5 seconds before trying again.' },
		{ name: 'semantic denial overrides wait', error: new CloudSandboxRequestError(403, 'private', 5, { code: 'forbidden' }), message: 'GitHub denied access. Check your repository access and your organization\'s cloud session settings.' },
		{ name: 'invalid request', error: new CloudSandboxRequestError(422, 'private'), message: 'The cloud session request is not valid. Check your repository and session settings.' },
		{ name: 'conflict', error: new CloudSandboxRequestError(409, 'private'), message: 'GitHub reported a conflicting operation. Check your cloud sessions before trying again.' },
	]) {
		test(`explains ${name} without exposing the response message`, () => {
			const failure = new CloudSandboxStartupError(error, 'creation', commandService);
			assert.deepStrictEqual({
				message: failure.message,
				actions: failure.actions.map(action => action.label),
				actionable: isErrorWithActions(failure),
			}, {
				message: `Couldn't start the cloud session. ${message}`,
				actions: ['Show Details'],
				actionable: true,
			});
		});
	}

	for (const error of [
		new CloudSandboxRequestError(500, 'private'),
		new CloudSandboxRequestError(408, 'private'),
		new CloudSandboxRequestError(201, 'private'),
		new CloudSandboxNetworkError('private'),
		new Error('private'),
	]) {
		test(`does not claim creation failed definitively for ${error.name} ${error instanceof CloudSandboxRequestError ? error.statusCode : 'no status'}`, () => {
			const failure = new CloudSandboxStartupError(error, 'creation', commandService);
			assert.strictEqual(failure.message, 'Couldn\'t confirm whether the cloud session was created. Check your cloud sessions before starting another.');
		});
	}

	test('distinguishes a connection failure after cloud setup started', () => {
		const failure = new CloudSandboxStartupError(new CloudSandboxRequestError(404, 'private'), 'connection', commandService);
		assert.deepStrictEqual(failure.detailsCommand.command.arguments, [
			'Cloud setup started, but VS Code couldn\'t connect. GitHub couldn\'t find or allow access to a required resource.',
			'Step: Connect to cloud session\nHTTP status: 404',
		]);
	});

	test('does not suggest that local preparation created a cloud session', () => {
		const failure = new CloudSandboxStartupError(new Error('private local setup error'), 'preparation', commandService);
		assert.deepStrictEqual(failure.detailsCommand.command.arguments, [
			'Couldn\'t prepare the cloud session. Check your session settings and GitHub sign-in before trying again.',
			'Step: Prepare cloud session',
		]);
	});

	test('keeps local validation actionable without inventing an HTTP status', () => {
		const failure = new CloudSandboxStartupError(new CloudSandboxRequestError(undefined, 'private', undefined, { code: 'invalid_request' }), 'creation', commandService);
		assert.deepStrictEqual(failure.detailsCommand.command.arguments, [
			'Couldn\'t start the cloud session. The cloud session request is not valid. Check your repository and session settings.',
			'Step: Create cloud session\nError code: invalid_request',
		]);
	});

	test('notification and transcript actions open the same safe details without sending a request', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const shown: { message: string; detail: string | undefined }[] = [];
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async error(message: string, detail?: string): Promise<void> {
				shown.push({ message, detail });
			}
		}());
		const execute = (id: string, ...args: unknown[]) => {
			const command = CommandsRegistry.getCommand(id);
			assert.ok(command);
			return instantiationService.invokeFunction(accessor => command.handler(accessor, ...args));
		};
		const commands = new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				await execute(id, ...args);
				return undefined;
			}
		}();
		const failure = new CloudSandboxStartupError(new CloudSandboxRequestError(404, 'private response body and token', undefined, {
			code: 'not_found', requestId: 'ABCD:1234:5678:90AB:CDEF',
		}), 'creation', commands);
		await failure.actions[0].run();
		await execute(failure.detailsCommand.command.id, ...failure.detailsCommand.command.arguments!);

		assert.deepStrictEqual(shown, Array.from({ length: 2 }, () => ({
			message: 'Couldn\'t start the cloud session. GitHub couldn\'t find or allow access to a required resource.',
			detail: 'Step: Create cloud session\nHTTP status: 404\nError code: not_found\nRequest reference: ABCD:1234:5678:90AB:CDEF',
		})));
	});

	test('rejects unsafe metadata rather than exposing it in details', () => {
		const failure = new CloudSandboxStartupError(new CloudSandboxRequestError(Number.NaN, 'private response', Number.POSITIVE_INFINITY, {
			code: 'ghp_private', requestId: 'https://github.com/orgs/example/sso?authorization_request=private',
		}), 'creation', commandService);
		assert.deepStrictEqual(failure.detailsCommand.command.arguments, [
			'Couldn\'t confirm whether the cloud session was created. Check your cloud sessions before starting another.',
			'Step: Create cloud session',
		]);
	});

	test('reports invalid details command input instead of opening an empty dialog', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async error(): Promise<void> { assert.fail('Invalid input must not open a dialog'); }
		}());
		const failure = new CloudSandboxStartupError(new Error('private'), 'creation', commandService);
		const command = CommandsRegistry.getCommand(failure.detailsCommand.command.id)!;
		await assert.rejects(async () => instantiationService.invokeFunction(accessor => command.handler(accessor, undefined, {})), /error details are unavailable/);
	});
});
