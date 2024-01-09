/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtensionHost, GitHubTarget, IFlowQuery, getFlows } from '../flows';
import { Config } from '../config';

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
				Flows.UrlHandlerFlow,
				Flows.LocalServerFlow,
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
				Flows.UrlHandlerFlow,
				Flows.LocalServerFlow,
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
});
