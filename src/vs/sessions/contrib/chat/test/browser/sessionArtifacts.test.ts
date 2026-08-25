/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildSessionArtifactSections, type ISessionArtifactActions } from '../../browser/sessionArtifacts.js';
import { type ISessionArtifact, SessionArtifactKind, SessionFileOperation } from '../../../../services/sessions/common/session.js';

suite('Session Artifacts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const actions: ISessionArtifactActions = {
		openExternal() { },
		openResource() { },
		openImages() { },
		copy() { },
	};

	test('shows each artifact URI or link beside its dropdown entry', () => {
		const fileUri = URI.file('/artifacts/report.md');
		const externalFileUri = URI.file('/external/plan.md');
		const resourceUri = URI.parse('vscode://sessions/resource');
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', link: pullRequestLink },
			{ id: 'file', kind: SessionArtifactKind.File, label: 'Report', uri: fileUri },
			{ id: 'resource', kind: SessionArtifactKind.Resource, label: 'Resource', uri: resourceUri },
		];

		const entries = buildSessionArtifactSections(artifacts, [{ uri: externalFileUri, operation: SessionFileOperation.Created }], actions, true, new Set()).flatMap(section => section.entries);
		assert.deepStrictEqual(entries.map(entry => {
			const content = entry.hover?.content;
			return {
				label: entry.label,
				ariaLabel: entry.ariaLabel,
				ariaDescription: entry.ariaDescription,
				hover: isMarkdownString(content) ? content.value : undefined,
				tooltip: entry.tooltip,
			};
		}), [
			{ label: 'PR #12', ariaLabel: 'Open PR #12', ariaDescription: pullRequestLink.toString(true), hover: pullRequestLink.toString(true), tooltip: pullRequestLink.toString(true) },
			{ label: 'report.md', ariaLabel: 'Open report.md', ariaDescription: fileUri.toString(true), hover: fileUri.toString(true), tooltip: fileUri.toString(true) },
			{ label: 'plan.md', ariaLabel: 'Open plan.md', ariaDescription: externalFileUri.toString(true), hover: externalFileUri.toString(true), tooltip: externalFileUri.toString(true) },
			{ label: 'Resource', ariaLabel: 'Open Resource', ariaDescription: resourceUri.toString(true), hover: resourceUri.toString(true), tooltip: resourceUri.toString(true) },
		]);
	});

	test('leaves out websites the browsers pill already lists', () => {
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'docs', kind: SessionArtifactKind.Website, label: 'Docs', link: URI.parse('https://example.com/docs') },
			{ id: 'docs-slash', kind: SessionArtifactKind.Website, label: 'Docs Index', link: URI.parse('https://Example.com/docs/') },
			{ id: 'deep', kind: SessionArtifactKind.Website, label: 'Deep Link', link: URI.parse('https://example.com/docs/api') },
			{ id: 'blog', kind: SessionArtifactKind.Website, label: 'Blog', link: URI.parse('https://other.test/blog') },
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', link: pullRequestLink },
		];
		const labels = (browserUrls: readonly string[]) => buildSessionArtifactSections(artifacts, [], actions, true, new Set(browserUrls))
			.flatMap(section => section.entries)
			.map(entry => entry.label);

		assert.deepStrictEqual({
			withBrowsers: labels(['https://example.com/docs', pullRequestLink.toString()]),
			withoutBrowsers: labels([]),
		}, {
			withBrowsers: ['PR #12', 'Deep Link', 'Blog'],
			withoutBrowsers: ['PR #12', 'Docs', 'Docs Index', 'Deep Link', 'Blog'],
		});
	});

});
