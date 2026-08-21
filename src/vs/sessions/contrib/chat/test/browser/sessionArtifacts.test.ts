/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildSessionArtifactSections, type ISessionArtifactActions, type ISessionArtifactImage } from '../../browser/sessionArtifacts.js';
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

		const entries = buildSessionArtifactSections(artifacts, [{ uri: externalFileUri, operation: SessionFileOperation.Created }], actions).flatMap(section => section.entries);
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

	test('groups artifact images separately and opens all images in the carousel', () => {
		const screenshotUri = URI.file('/artifacts/screenshot.png');
		const diagramUri = URI.file('/external/diagram.jpg');
		const reportUri = URI.file('/artifacts/report.md');
		const opened: { images: readonly ISessionArtifactImage[]; startIndex: number }[] = [];
		const imageActions: ISessionArtifactActions = {
			...actions,
			openImages: (images, startIndex) => opened.push({ images, startIndex }),
		};
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'screenshot', kind: SessionArtifactKind.File, label: 'Screenshot', uri: screenshotUri },
			{ id: 'report', kind: SessionArtifactKind.File, label: 'Report', uri: reportUri },
		];

		const sections = buildSessionArtifactSections(artifacts, [
			{ uri: diagramUri, operation: SessionFileOperation.Created },
		], imageActions);
		const imageSection = sections.find(section => section.title === 'Images');
		assert.ok(imageSection);
		imageSection.entries[1].open();

		assert.deepStrictEqual({
			sections: sections.map(section => ({ title: section.title, labels: section.entries.map(entry => entry.label) })),
			opened: opened.map(entry => ({ images: entry.images.map(image => image.uri.path), startIndex: entry.startIndex })),
		}, {
			sections: [
				{ title: 'Images', labels: ['screenshot.png', 'diagram.jpg'] },
				{ title: 'Files', labels: ['report.md'] },
			],
			opened: [{ images: ['/artifacts/screenshot.png', '/external/diagram.jpg'], startIndex: 1 }],
		});
	});
});
