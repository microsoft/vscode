/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtensionHost, GitHubTarget, IFlowQuery, getFlows } from '../flows';
import { Config } from '../config';
import * as vscode from 'vscode';

const enum Flows {
	UrlHandlerFlow = 'url handler',
	LocalServerFlow = 'local server',
	DeviceCodeFlow = 'device code',
	PatFlow = 'personal access token'
}

suite('getFlows', () => {
	let lastClientSecret: string | undefined = undefined;
	suiteSetup(() => {
		lastClientSecret = Config.gitHubClientSecret;
		Config.gitHubClientSecret = 'asdf';
	});

	suiteTeardown(() => {
		Config.gitHubClientSecret = lastClientSecret;
	});

	const testCases: Array<{ label: string; query: IFlowQuery; expectedFlows: Flows[] }> = [
		{
			label: 'VS Code Desktop. Local filesystem. GitHub.com',
			query: {
				extensionHost: ExtensionHost.Local,
				isSupportedClient: true,
				target: GitHubTarget.DotCom
			},
			expectedFlows: [
				Flows.LocalServerFlow,
				Flows.UrlHandlerFlow,
				Flows.DeviceCodeFlow
			]
		},
		{
			label: 'VS Code Desktop. Local filesystem. GitHub Hosted Enterprise',
			query: {
				extensionHost: ExtensionHost.Local,
				isSupportedClient: true,
				target: GitHubTarget.HostedEnterprise
			},
			expectedFlows: [
				Flows.LocalServerFlow,
				Flows.UrlHandlerFlow,
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'VS Code Desktop. Local filesystem. GitHub Enterprise Server',
			query: {
				extensionHost: ExtensionHost.Local,
				isSupportedClient: true,
				target: GitHubTarget.Enterprise
			},
			expectedFlows: [
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'vscode.dev. serverful. GitHub.com',
			query: {
				extensionHost: ExtensionHost.Remote,
				isSupportedClient: true,
				target: GitHubTarget.DotCom
			},
			expectedFlows: [
				Flows.UrlHandlerFlow,
				Flows.DeviceCodeFlow
			]
		},
		{
			label: 'vscode.dev. serverful. GitHub Hosted Enterprise',
			query: {
				extensionHost: ExtensionHost.Remote,
				isSupportedClient: true,
				target: GitHubTarget.HostedEnterprise
			},
			expectedFlows: [
				Flows.UrlHandlerFlow,
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'vscode.dev. serverful. GitHub Enterprise',
			query: {
				extensionHost: ExtensionHost.Remote,
				isSupportedClient: true,
				target: GitHubTarget.Enterprise
			},
			expectedFlows: [
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'vscode.dev. serverless. GitHub.com',
			query: {
				extensionHost: ExtensionHost.WebWorker,
				isSupportedClient: true,
				target: GitHubTarget.DotCom
			},
			expectedFlows: [
				Flows.UrlHandlerFlow
			]
		},
		{
			label: 'vscode.dev. serverless. GitHub Hosted Enterprise',
			query: {
				extensionHost: ExtensionHost.WebWorker,
				isSupportedClient: true,
				target: GitHubTarget.HostedEnterprise
			},
			expectedFlows: [
				Flows.UrlHandlerFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'vscode.dev. serverless. GitHub Enterprise Server',
			query: {
				extensionHost: ExtensionHost.WebWorker,
				isSupportedClient: true,
				target: GitHubTarget.Enterprise
			},
			expectedFlows: [
				Flows.PatFlow
			]
		},
		{
			label: 'Code - OSS. Local filesystem. GitHub.com',
			query: {
				extensionHost: ExtensionHost.Local,
				isSupportedClient: false,
				target: GitHubTarget.DotCom
			},
			expectedFlows: [
				Flows.LocalServerFlow,
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'Code - OSS. Local filesystem. GitHub Hosted Enterprise',
			query: {
				extensionHost: ExtensionHost.Local,
				isSupportedClient: false,
				target: GitHubTarget.HostedEnterprise
			},
			expectedFlows: [
				Flows.LocalServerFlow,
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
		{
			label: 'Code - OSS. Local filesystem. GitHub Enterprise Server',
			query: {
				extensionHost: ExtensionHost.Local,
				isSupportedClient: false,
				target: GitHubTarget.Enterprise
			},
			expectedFlows: [
				Flows.DeviceCodeFlow,
				Flows.PatFlow
			]
		},
	];

	for (const testCase of testCases) {
		test(`gives the correct flows - ${testCase.label}`, () => {
			const flows = getFlows(testCase.query);

			assert.strictEqual(
				flows.length,
				testCase.expectedFlows.length,
				`Unexpected number of flows: ${flows.map(f => f.label).join(',')}`
			);

			for (let i = 0; i < flows.length; i++) {
				const flow = flows[i];

				assert.strictEqual(flow.label, testCase.expectedFlows[i]);
			}
		});
	}

	suite('preferDeviceCodeFlow configuration', () => {
		let originalConfig: boolean | undefined;

		suiteSetup(async () => {
			const config = vscode.workspace.getConfiguration('github-authentication');
			originalConfig = config.get<boolean>('preferDeviceCodeFlow');
		});

		suiteTeardown(async () => {
			const config = vscode.workspace.getConfiguration('github-authentication');
			await config.update('preferDeviceCodeFlow', originalConfig, vscode.ConfigurationTarget.Global);
		});

		test('returns device code flow first when preferDeviceCodeFlow is true - VS Code Desktop', async () => {
			const config = vscode.workspace.getConfiguration('github-authentication');
			await config.update('preferDeviceCodeFlow', true, vscode.ConfigurationTarget.Global);

			const flows = getFlows({
				extensionHost: ExtensionHost.Local,
				isSupportedClient: true,
				target: GitHubTarget.DotCom
			});

			// Should return device code flow first, then other flows
			assert.strictEqual(flows.length, 3, `Expected 3 flows, got ${flows.length}: ${flows.map(f => f.label).join(',')}`);
			assert.strictEqual(flows[0].label, Flows.DeviceCodeFlow);
			// Other flows should still be available
			assert.strictEqual(flows[1].label, Flows.LocalServerFlow);
			assert.strictEqual(flows[2].label, Flows.UrlHandlerFlow);
		});

		test('returns device code flow first when preferDeviceCodeFlow is true - Remote', async () => {
			const config = vscode.workspace.getConfiguration('github-authentication');
			await config.update('preferDeviceCodeFlow', true, vscode.ConfigurationTarget.Global);

			const flows = getFlows({
				extensionHost: ExtensionHost.Remote,
				isSupportedClient: true,
				target: GitHubTarget.DotCom
			});

			// Should return device code flow first, then other flows
			assert.strictEqual(flows.length, 2, `Expected 2 flows, got ${flows.length}: ${flows.map(f => f.label).join(',')}`);
			assert.strictEqual(flows[0].label, Flows.DeviceCodeFlow);
			assert.strictEqual(flows[1].label, Flows.UrlHandlerFlow);
		});

		test('returns normal flows when preferDeviceCodeFlow is true but device code flow is not supported - WebWorker', async () => {
			const config = vscode.workspace.getConfiguration('github-authentication');
			await config.update('preferDeviceCodeFlow', true, vscode.ConfigurationTarget.Global);

			const flows = getFlows({
				extensionHost: ExtensionHost.WebWorker,
				isSupportedClient: true,
				target: GitHubTarget.DotCom
			});

			// WebWorker doesn't support DeviceCodeFlow, so should return normal flows
			// Based on the original logic, WebWorker + DotCom should return UrlHandlerFlow
			assert.strictEqual(flows.length, 1, `Expected 1 flow for WebWorker configuration, got ${flows.length}: ${flows.map(f => f.label).join(',')}`);
			assert.strictEqual(flows[0].label, Flows.UrlHandlerFlow);
		});
	});
});
