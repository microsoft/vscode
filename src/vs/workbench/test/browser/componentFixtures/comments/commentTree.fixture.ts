/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ITreeNode } from '../../../../../base/browser/ui/tree/tree.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { Comment, CommentThread } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CommentNode } from '../../../../contrib/comments/common/commentModel.js';
import { COMMENTS_SECTION } from '../../../../contrib/comments/common/commentsConfiguration.js';
import { CommentNodeRenderer, CommentsMenus } from '../../../../contrib/comments/browser/commentsTreeViewer.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../contrib/comments/browser/media/panel.css';

function wrapAsTreeNode(element: CommentNode): ITreeNode<CommentNode> {
	return {
		element,
		children: [],
		depth: 0,
		visibleChildrenCount: 0,
		visibleChildIndex: 0,
		collapsible: false,
		collapsed: false,
		visible: true,
		filterData: undefined,
	};
}

function renderCommentTreeMetadata(context: ComponentFixtureContext, zoom: number): void {
	const { container, disposableStore } = context;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: registerWorkbenchServices,
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configurationService.setUserConfiguration(COMMENTS_SECTION, { useRelativeTime: true });

	const menus = disposableStore.add(instantiationService.createInstance(CommentsMenus));
	const renderer = instantiationService.createInstance(
		CommentNodeRenderer,
		() => undefined,
		menus,
	);
	const comment: Comment = {
		body: 'Comment preview',
		uniqueIdInThread: 1,
		userName: 'roblourens',
		timestamp: new Date(Date.now() - 33 * 60 * 1000).toISOString(),
	};
	const thread = upcastPartial<CommentThread>({
		threadId: 'fixture-comment-thread',
		comments: [comment],
		controllerHandle: 1,
		commentThreadHandle: 1,
		canReply: false,
	});
	const commentNode = new CommentNode('fixture', 'fixture', URI.file('/workspace/file.ts'), comment, thread);
	const treeNode = wrapAsTreeNode(commentNode);

	container.classList.add('monaco-workbench', 'comments-panel');
	container.style.width = '480px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const panelContainer = dom.append(container, dom.$('.comments-panel-container'));
	const treeContainer = dom.append(panelContainer, dom.$('.tree-container'));
	const list = dom.append(treeContainer, dom.$('.monaco-list'));
	const row = dom.append(list, dom.$('.monaco-list-row'));
	row.style.position = 'relative';
	row.style.height = '22px';
	row.style.setProperty('zoom', String(zoom));

	const template = renderer.renderTemplate(row);
	renderer.renderElement(treeNode, 0, template);
	disposableStore.add(toDisposable(() => {
		renderer.disposeElement(treeNode, 0, template);
		renderer.disposeTemplate(template);
	}));
}

const expectedVisualDescriptions = [
	'The comment author and relative timestamp use the same body type size and sit on the same text baseline.',
];

export default defineThemedFixtureGroup({ path: 'comments/' }, {
	CommentTreeMetadata: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions,
		render: context => renderCommentTreeMetadata(context, 1),
	}),
	CommentTreeMetadataZoomed: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions,
		render: context => renderCommentTreeMetadata(context, 1.25),
	}),
});
