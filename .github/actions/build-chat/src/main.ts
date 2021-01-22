/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as core from '@actions/core';
import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import { WebClient } from '@slack/web-api';
import * as storage from 'azure-storage';
import { WritableStreamBuffer } from 'stream-buffers';

(async () => {
	const actionUrl = core.getInput('workflow_run_url');
	const url = actionUrl || 'https://api.github.com/repos/microsoft/vscode/actions/runs/501214268';
	console.log(url);
	const parts = url.split('/');
	const owner = parts[parts.length - 5];
	const repo = parts[parts.length - 4];
	const runId = parseInt(parts[parts.length - 1], 10);
	if (actionUrl) {
		await handleNotification(owner, repo, runId);
	} else {
		const results = await buildComplete(owner, repo, runId);
		for (const message of [...results.logMessages, ...results.messages]) {
			console.log(message);
		}
	}
})()
	.then(null, console.error);

const testChannels = ['bot-log', 'bot-test-log'];

async function handleNotification(owner: string, repo: string, runId: number) {

	const results = await buildComplete(owner, repo, runId);
	if (results.logMessages.length || results.messages.length) {

		const web = new WebClient(process.env.SLACK_TOKEN);
		const memberships = await listAllMemberships(web);
		const memberTestChannels = memberships.filter(m => testChannels.indexOf(m.name) !== -1);

		for (const message of results.logMessages) {
			for (const testChannel of memberTestChannels) {
				await web.chat.postMessage({
					text: message,
					channel: testChannel.id,
				});
			}
		}
		for (const message of results.messages) {
			for (const channel of memberships) {
				await web.chat.postMessage({
					text: message,
					channel: channel.id,
				});
			}
		}
	}
}

async function buildComplete(owner: string, repo: string, runId: number) {
	console.log(`buildComplete: https://github.com/${owner}/${repo}/actions/runs/${runId}`);
	const auth = `token ${process.env.GITHUB_TOKEN}`;
	const octokit = new Octokit({ auth });
	const buildResult = (await octokit.actions.getWorkflowRun({
		owner,
		repo,
		run_id: runId,
	})).data;
	if (buildResult.head_branch !== 'master' && !buildResult.head_branch?.startsWith('release/')) {
		console.error('Private branch. Terminating.')
		return { logMessages: [], messages: [] };
	}

	// const buildQuery = `${buildsApiUrl}?$top=10&maxTime=${buildResult.finishTime}&definitions=${buildResult.definition.id}&branchName=${buildResult.sourceBranch}&resultFilter=${results.join(',')}&api-version=5.0-preview.4`;

	const buildResults = (await octokit.actions.listWorkflowRuns({
		owner,
		repo,
		workflow_id: buildResult.workflow_id,
		branch: buildResult.head_branch || undefined,
		per_page: 5, // More returns 502s.
	})).data.workflow_runs
		.filter(run => run.status === 'completed');

	const currentBuildIndex = buildResults.findIndex(build => build.id === buildResult.id);
	if (currentBuildIndex === -1) {
		console.error('Build not on first page. Terminating.')
		console.error(buildResults.map(({ id, status, conclusion }) => ({ id, status, conclusion })));
		return { logMessages: [], messages: [] };
	}
	const slicedResults = buildResults.slice(currentBuildIndex, currentBuildIndex + 2);
	const builds = slicedResults
		.map<Build>((build, i, array) => ({
			data: build,
			previousSourceVersion: i < array.length - 1 ? array[i + 1].head_sha : undefined,
			authors: [],
			buildHtmlUrl: build.html_url,
			changesHtmlUrl: '',
		}));
	const logMessages = builds.slice(0, 1)
		.map(build => `Id: ${build.data.id} | Branch: ${build.data.head_branch} | Conclusion: ${build.data.conclusion} | Created: ${build.data.created_at} | Updated: ${build.data.updated_at}`);
	const transitionedBuilds = builds.filter((build, i, array) => i < array.length - 1 && transitioned(build, array[i + 1]));
	await Promise.all(transitionedBuilds
		.map(async build => {
			if (build.previousSourceVersion) {
				const cmp = await compareCommits(octokit, owner, repo, build.previousSourceVersion, build.data.head_sha);
				const commits = cmp.data.commits;
				const authors = new Set<string>([
					...commits.map((c: any) => c.author.login),
					...commits.map((c: any) => c.committer.login),
				]);
				authors.delete('web-flow'); // GitHub Web UI committer
				build.authors = [...authors];
				build.changesHtmlUrl = `https://github.com/${owner}/${repo}/compare/${build.previousSourceVersion.substr(0, 7)}...${build.data.head_sha.substr(0, 7)}`; // Shorter than: cmp.data.html_url
			}
		}));
	const vscode = repo === 'vscode';
	const name = vscode ? `VS Code ${buildResult.name} Build` : buildResult.name;
	// TBD: `Requester: ${vstsToSlackUser(build.requester, build.degraded)}${pingBenForSmokeTests && releaseBuild && build.result === 'partiallySucceeded' ? ' | Ping: @bpasero' : ''}`
	const accounts = await readAccounts();
	const githubAccountMap = githubToAccounts(accounts);
	const messages = transitionedBuilds.map(build => `${name}
Result: ${build.data.conclusion} | Branch: ${build.data.head_branch} | Authors: ${githubToSlackUsers(githubAccountMap, build.authors, build.degraded).sort().join(', ') || `None (rebuild)`}
Build: ${build.buildHtmlUrl}
Changes: ${build.changesHtmlUrl}`);
	return { logMessages, messages };
}

const conclusions = ['success', 'failure']

function transitioned(newer: Build, older: Build) {
	const newerResult = newer.data.conclusion || 'success';
	const olderResult = older.data.conclusion || 'success';
	if (newerResult === olderResult) {
		return false;
	}
	if (conclusions.indexOf(newerResult) > conclusions.indexOf(olderResult)) {
		newer.degraded = true;
	}
	return true;
}

async function compareCommits(octokit: Octokit, owner: string, repo: string, base: string, head: string) {
	return octokit.repos.compareCommits({ owner, repo, base, head });
}

function githubToSlackUsers(githubToAccounts: Record<string, Accounts>, githubUsers: string[], at?: boolean) {
	return githubUsers.map(g => githubToAccounts[g] ? `${at ? '@' : ''}${githubToAccounts[g].slack}` : g);
}

interface Accounts {
	github: string;
	slack: string;
	vsts: string;
}

function githubToAccounts(accounts: Accounts[]) {
	return accounts.reduce((m, e) => {
		m[e.github] = e;
		return m;
	}, <Record<string, Accounts>>{});
}

async function readAccounts() {
	const connectionString = process.env.BUILD_CHAT_STORAGE_CONNECTION_STRING;
	if (!connectionString) {
		console.error('Connection string missing.');
		return [];
	}
	const buf = await readFile(connectionString, 'config', '/', 'accounts.json');
	return JSON.parse(buf.toString()) as Accounts[];
}

async function readFile(connectionString: string, share: string, directory: string, filename: string) {
	return new Promise<Buffer>((resolve, reject) => {
		const stream = new WritableStreamBuffer()
		const fileService = storage.createFileService(connectionString);
		fileService.getFileToStream(share, directory, filename, stream, err => {
			if (err) {
				reject(err);
			} else {
				const contents = stream.getContents();
				if (contents) {
					resolve(contents);
				} else {
					reject(new Error('No content'));
				}
			}
		});
	});
}

interface AllChannels {
	channels: {
		id: string;
		name: string;
		is_member: boolean;
	}[];
}

async function listAllMemberships(web: WebClient) {
	const groups = await web.conversations.list({ types: 'public_channel,private_channel' }) as unknown as AllChannels;
	return groups.channels
		.filter(c => c.is_member);
}

interface Build {
	data: RestEndpointMethodTypes['actions']['getWorkflowRun']['response']['data'];
	previousSourceVersion: string | undefined;
	authors: string[];
	buildHtmlUrl: string;
	changesHtmlUrl: string;
	degraded?: boolean;
}
