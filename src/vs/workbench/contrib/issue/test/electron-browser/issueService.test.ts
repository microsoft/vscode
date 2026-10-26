/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationOverrides, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IExtensionManagementService, ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IColorTheme, IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchExtensionEnablementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IIntegrityService } from '../../../../services/integrity/common/integrity.js';
import { IIssueFormService, IssueReporterData, IssueSource } from '../../common/issue.js';
import { internalIssueReporterUrl, issueReporterAdditionalRepositoriesSettingId, issueReporterRepositoryPattern, resolveIssueReporterTarget } from '../../common/issueReporterTarget.js';
import '../../electron-browser/issue.contribution.js';
import { NativeIssueService } from '../../electron-browser/issueService.js';

suite('NativeIssueService additional repositories', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const product = { reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new' };

	function createService(wizard: boolean, repositories: unknown, extensions: ILocalExtension[] = []) {
		const instantiationService = store.add(new TestInstantiationService());
		const opened: IssueReporterData[] = [];
		const authenticationProviders: string[] = [];
		const authenticationSessions: AuthenticationSession[] = [];
		const telemetry = new TestExperimentTriggerTelemetryService();
		const warnings: string[] = [];
		const errors: string[] = [];
		const configurationReads: string[] = [];
		instantiationService.stub(IIssueFormService, { openReporter: async data => { opened.push(data); } });
		instantiationService.stub(IThemeService, { getColorTheme: () => new class extends mock<IColorTheme>() { override getColor() { return undefined; } }() });
		instantiationService.stub(IExtensionManagementService, { getInstalled: async () => extensions });
		instantiationService.stub(IWorkbenchExtensionEnablementService, { isEnabled: () => true });
		instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => true });
		instantiationService.stub(IWorkbenchAssignmentService, { getCurrentExperiments: async () => [] });
		instantiationService.stub(IAuthenticationService, { getSessions: async provider => { authenticationProviders.push(provider); return authenticationSessions; } });
		instantiationService.stub(IIntegrityService, { isPure: async () => ({ isPure: true, proof: [] }) });
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(IConfigurationService, new class extends TestConfigurationService {
			override getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T | undefined {
				if (typeof arg1 === 'string') {
					configurationReads.push(arg1);
				}
				return super.getValue<T>(arg1, arg2);
			}
		}({
			'issueReporter.wizard.enabled': wizard,
			...(repositories === undefined ? {} : { [issueReporterAdditionalRepositoriesSettingId]: repositories }),
		}));
		instantiationService.stub(IProductService, product);
		instantiationService.stub(ITelemetryService, telemetry);
		instantiationService.stub(ILogService, { error: message => errors.push(String(message)) });
		instantiationService.stub(INotificationService, { warn: message => { warnings.push(String(message)); } });
		return { service: instantiationService.createInstance(NativeIssueService), opened, authenticationProviders, authenticationSessions, telemetry, warnings, errors, configurationReads };
	}

	test('new reporter refreshes existing repo-scoped GitHub sessions without prompting', async () => {
		const { service, opened, authenticationSessions, authenticationProviders } = createService(true, []);
		await service.openReporter();
		await opened[0].whenDataComplete;
		const initial = opened[0].githubAccessToken;
		const session = (id: string, scopes: string[]): AuthenticationSession => ({ id, scopes, accessToken: `${id}-token`, account: { id, label: id } });
		authenticationSessions.push(session('read-user', ['read:user']), session('first-repo', ['repo']), session('second-repo', ['repo']));
		const signedIn = await opened[0].getGitHubAccessToken?.();
		authenticationSessions.splice(0, authenticationSessions.length, session('replacement-repo', ['repo']));
		const changed = await opened[0].getGitHubAccessToken?.();
		authenticationSessions.length = 0;
		const signedOut = await opened[0].getGitHubAccessToken?.();
		assert.deepStrictEqual({ initial, signedIn, changed, signedOut, authenticationProviders }, {
			initial: '', signedIn: 'first-repo-token', changed: 'replacement-repo-token', signedOut: '',
			authenticationProviders: ['github', 'github', 'github', 'github'],
		});
	});

	for (const githubAccessToken of ['', 'explicit-caller-token']) {
		test(`new reporter preserves the explicit caller token ${JSON.stringify(githubAccessToken)}`, async () => {
			const { service, opened, authenticationProviders } = createService(true, []);
			await service.openReporter({ githubAccessToken });
			await opened[0].whenDataComplete;
			assert.deepStrictEqual({
				token: opened[0].githubAccessToken, resolver: opened[0].getGitHubAccessToken, authenticationProviders,
			}, { token: githubAccessToken, resolver: undefined, authenticationProviders: [] });
		});
	}

	test('repository schema is application-scoped, empty by default and experiment-enabled without an authorization policy', () => {
		const schema = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurationProperties()[issueReporterAdditionalRepositoriesSettingId];
		assert.deepStrictEqual({
			type: schema.type, default: schema.default, scope: schema.scope, experiment: schema.experiment, policy: schema.policy,
			items: schema.items,
		}, {
			type: 'array', default: [], scope: ConfigurationScope.APPLICATION, experiment: { mode: 'auto' }, policy: undefined,
			items: { type: 'string', pattern: issueReporterRepositoryPattern, patternErrorMessage: 'Use a GitHub repository in owner/repo format, not a URL.' },
		});
	});

	for (const wizard of [false, true]) {
		for (const extensionId of [undefined, 'publisher.first']) {
			test(`${wizard ? 'wizard scopes' : 'legacy preserves baseline mapping of'} caller overrides for ${extensionId}`, async () => {
				const extensions = ['first', 'second'].map(name => new class extends mock<ILocalExtension>() {
					override readonly identifier = { id: `publisher.${name}` };
					override readonly type = ExtensionType.User;
					override readonly manifest = { name, publisher: 'publisher', version: '1', engines: { vscode: '*' } };
				}());
				const { service, opened } = createService(wizard, ['owner/extra'], extensions);
				await service.openReporter({
					extensionId, uri: URI.parse(product.reportIssueUrl), privateUri: URI.parse(internalIssueReporterUrl), data: 'Caller diagnostics',
				});
				await opened[0].whenDataComplete;
				assert.deepStrictEqual(opened[0].enabledExtensions.map(extension => ({
					id: extension.id, uri: URI.revive(extension.uri)?.toString(), privateUri: URI.revive(extension.privateUri)?.toString(), data: extension.data,
				})), extensions.map(extension => ({
					id: extension.identifier.id,
					uri: !wizard || extension.identifier.id === extensionId ? product.reportIssueUrl : undefined,
					privateUri: wizard && extension.identifier.id === extensionId ? internalIssueReporterUrl : undefined,
					data: !wizard || extension.identifier.id === extensionId ? 'Caller diagnostics' : undefined,
				})));
			});
		}

		for (const repositories of [undefined, [], ['owner/extra'], ['Owner/extra', 'owner/EXTRA', 'other/third']]) {
			test(`${wizard ? 'wizard loads' : 'legacy ignores'} additional repositories ${JSON.stringify(repositories)}`, async () => {
				const { service, opened, authenticationProviders, telemetry, configurationReads, errors, warnings } = createService(wizard, repositories);
				await service.openReporter();
				await opened[0].whenDataComplete;
				const data = opened[0];
				assert.deepStrictEqual({
					target: wizard ? resolveIssueReporterTarget(data, product) : undefined,
					privateUrl: URI.revive(data.privateUri)?.toString(),
					destination: data.issueRepository,
					repositories: data.additionalRepositories,
					wizard: !!data.whenDataComplete,
					authenticationProviders,
					triggers: telemetry.triggers,
					configurationReads, errors, warnings,
				}, {
					target: wizard ? { url: product.reportIssueUrl, external: false, isPrivate: false, isPublic: true, repository: { owner: 'microsoft', repositoryName: 'vscode' } } : undefined,
					privateUrl: undefined,
					destination: undefined,
					repositories: wizard ? repositories?.length === 3 ? ['Owner/extra', 'other/third'] : repositories ?? [] : undefined,
					wizard,
					authenticationProviders: ['github'],
					triggers: wizard ? [`config.${issueReporterAdditionalRepositoriesSettingId}`] : [],
					configurationReads: wizard ? ['issueReporter.wizard.enabled', issueReporterAdditionalRepositoriesSettingId] : ['issueReporter.wizard.enabled'],
					errors: [], warnings: [],
				});
			});
		}

		for (const repositories of [true, 'owner/repo', [123], ['valid/repo', 'https://github.com/owner/repo']]) {
			test(`${wizard ? 'wizard rejects' : 'legacy does not read or validate'} invalid additional repositories ${JSON.stringify(repositories)}`, async () => {
				const { service, opened, warnings, errors, telemetry, configurationReads } = createService(wizard, repositories);
				await service.openReporter();
				assert.deepStrictEqual({
					repositories: opened[0].additionalRepositories,
					target: wizard ? resolveIssueReporterTarget(opened[0], product)?.url : undefined,
					errors, warnings, triggers: telemetry.triggers, configurationReads,
				}, {
					repositories: wizard ? [] : undefined, target: wizard ? product.reportIssueUrl : undefined,
					errors: wizard ? ['[IssueReporter] Invalid additional repositories setting.'] : [],
					warnings: wizard ? ['The issueReporter.additionalRepositories setting must be an array of GitHub repositories in owner/repo format. Additional destinations were not loaded.'] : [],
					triggers: wizard ? [`config.${issueReporterAdditionalRepositoriesSettingId}`] : [],
					configurationReads: wizard ? ['issueReporter.wizard.enabled', issueReporterAdditionalRepositoriesSettingId] : ['issueReporter.wizard.enabled'],
				});
			});
		}

		for (const overrides of [
			{ uri: URI.parse('https://github.com/owner/custom/issues/new') },
			{ uri: URI.parse(internalIssueReporterUrl), privateUri: URI.parse(internalIssueReporterUrl) },
			{ privateUri: URI.parse('https://github.com/owner/private') },
			{ extensionId: 'publisher.extension', issueSource: IssueSource.Extension },
			{ issueSource: IssueSource.Marketplace },
		]) {
			test(`${wizard ? 'wizard' : 'classic'} preserves caller routing ${JSON.stringify(overrides)}`, async () => {
				const { service, opened, telemetry } = createService(wizard, ['owner/extra']);
				await service.openReporter(overrides);
				await opened[0].whenDataComplete;
				assert.deepStrictEqual({
					uri: opened[0].uri,
					privateUri: opened[0].privateUri,
					extensionId: opened[0].extensionId,
					issueSource: opened[0].issueSource,
					triggers: telemetry.triggers,
				}, {
					uri: overrides.uri,
					privateUri: overrides.privateUri,
					extensionId: overrides.extensionId,
					issueSource: overrides.issueSource,
					triggers: wizard && !overrides.uri && overrides.privateUri ? [`config.${issueReporterAdditionalRepositoriesSettingId}`] : [],
				});
			});
		}
	}
});
