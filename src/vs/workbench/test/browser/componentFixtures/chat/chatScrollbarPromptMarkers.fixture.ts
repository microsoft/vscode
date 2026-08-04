/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatScrollbarPromptMarkerController, IChatScrollbarPromptMarkerHost } from '../../../../contrib/chat/browser/widget/chatScrollbarPromptMarkerController.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../../../contrib/chat/common/constants.js';
import { IChatResponseModel, IResponse } from '../../../../contrib/chat/common/model/chatModel.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { IChatExternalEdit, IChatQuestionCarousel } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

class FixtureHost extends mock<IChatScrollbarPromptMarkerHost>() implements IChatScrollbarPromptMarkerHost {
	override readonly renderHeight: number;
	private readonly items: Array<IChatRequestViewModel | IChatResponseViewModel>;
	private readonly layoutInfo: { parent: HTMLElement; insertBefore: HTMLElement };

	constructor(
		renderHeight: number,
		items: Array<IChatRequestViewModel | IChatResponseViewModel>,
		layoutInfo: { parent: HTMLElement; insertBefore: HTMLElement },
	) {
		super();
		this.renderHeight = renderHeight;
		this.items = items;
		this.layoutInfo = layoutInfo;
	}

	override getOverviewRulerLayoutInfo() { return this.layoutInfo; }
	override getItems() { return this.items; }
	override getVisiblePromptRowId() { return this.items.find((item): item is IChatRequestViewModel => 'messageText' in item)?.id; }
	override hasElement(element: IChatRequestViewModel | IChatResponseViewModel) { return this.items.includes(element); }
	override isElementInViewport() { return false; }
	override getFocus() { return []; }
	override reveal() { }
	override focusItem() { }
}

function makeRequest(id: string, messageText: string): IChatRequestViewModel {
	return new class extends mock<IChatRequestViewModel>() {
		override id = id;
		override dataId = id;
		override username = 'User';
		override message = undefined!;
		override messageText = messageText;
		override attempt = 0;
		override variables = [];
		override currentRenderedHeight = undefined;
		override isComplete = true;
		override isCompleteAddedRequest = false;
		override agentOrSlashCommandDetected = false;
		override timestamp = 0;
		override editedFileEvents = undefined;
		override isSystemInitiated = undefined;
		override slashCommand = undefined;
	}();
}

function makeResponse(requestId: string, parts: IResponse['value'] = [], errorDetails?: IChatResponseViewModel['errorDetails']): IChatResponseViewModel {
	const response = new class extends mock<IResponse>() {
		override value = parts;
		override getMarkdown() { return ''; }
		override getFinalResponse() { return ''; }
		override toString() { return ''; }
	}();
	const model = new class extends mock<IChatResponseModel>() {
		override entireResponse = response;
	}();
	return new class extends mock<IChatResponseViewModel>() {
		override id = `${requestId}-response`;
		override model = model;
		override dataId = `${requestId}-response`;
		override username = 'Assistant';
		override agentOrSlashCommandDetected = false;
		override response = response;
		override usedContext = undefined;
		override contentReferences = [];
		override codeCitations = [];
		override progressMessages = [];
		override isComplete = true;
		override isCanceled = false;
		override isStale = false;
		override vote = undefined;
		override requestId = requestId;
		override replyFollowups = undefined;
		override errorDetails = errorDetails;
		override result = undefined;
		override contentUpdateTimings = undefined;
		override isCompleteAddedRequest = false;
		override currentRenderedHeight = undefined;
		override setVote() { }
		override setEditApplied() { }
		override vulnerabilitiesListExpanded = false;
	}();
}

function renderFixture(context: ComponentFixtureContext, options: { rtl?: boolean; hovered?: boolean }): void {
	const { container, disposableStore } = context;

	container.style.width = '120px';
	container.style.height = '260px';
	container.style.padding = 'var(--vscode-spacing-size160)';
	container.style.background = 'var(--vscode-editor-background)';
	container.style.position = 'relative';
	container.classList.add('monaco-workbench');
	container.dir = options.rtl ? 'rtl' : 'ltr';

	const rulerParent = dom.$('.chat-scrollbar-marker-fixture-ruler');
	rulerParent.style.position = 'relative';
	rulerParent.style.blockSize = '220px';
	rulerParent.style.inlineSize = '14px';
	rulerParent.style.marginInlineStart = 'auto';
	rulerParent.style.background = 'var(--vscode-scrollbarSlider-background)';
	rulerParent.style.opacity = '0.25';

	const insertBefore = dom.$('.visible');
	insertBefore.style.inlineSize = '14px';
	insertBefore.style.blockSize = '220px';
	insertBefore.getBoundingClientRect = () => ({
		width: 14,
		height: 220,
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: 14,
		bottom: 220,
		toJSON: () => ({}),
	});

	rulerParent.appendChild(insertBefore);
	container.appendChild(rulerParent);

	const questionCarousel: IChatQuestionCarousel = { kind: 'questionCarousel', questions: [], allowSkip: true };
	const externalEdit: IChatExternalEdit = { kind: 'externalEdit', uri: URI.parse('file:///fixture/edit.txt'), editKind: 'edit' };

	const items = [
		makeRequest('prompt-short', 'Short prompt'),
		makeResponse('prompt-short', [questionCarousel]),
		makeRequest('prompt-medium', 'This is a medium-length prompt for the fixture'),
		makeResponse('prompt-medium', [externalEdit]),
		makeRequest('prompt-long', 'This is the longest prompt in the fixture so the proportional hover width expands significantly more than the shorter prompts'),
		makeResponse('prompt-long', [], { message: 'boom' }),
	];

	const controller = disposableStore.add(new ChatScrollbarPromptMarkerController(
		new FixtureHost(220, items, { parent: rulerParent, insertBefore }),
		new TestConfigurationService({
			'chat.scrollbarPromptMarkers.clickBehavior': ChatScrollbarPromptMarkerClickBehavior.Reveal,
		}),
	));

	controller.layout();
	if (options.hovered) {
		controller['container'].classList.add('chat-scrollbar-prompt-markers-hover');
	}

	const label = dom.$('.chat-scrollbar-marker-fixture-label');
	label.textContent = options.rtl ? 'RTL inline-end aligned stack' : 'LTR inline-end aligned stack';
	label.style.marginBlockStart = 'var(--vscode-spacing-size120)';
	label.style.fontSize = 'var(--vscode-bodyFontSize-small)';
	label.style.color = 'var(--vscode-descriptionForeground)';
	container.appendChild(label);
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ChatScrollbarPromptMarkers: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderFixture(context, {}),
	}),
	ChatScrollbarPromptMarkersHovered: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderFixture(context, { hovered: true }),
	}),
	ChatScrollbarPromptMarkersRtl: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderFixture(context, { rtl: true }),
	}),
	ChatScrollbarPromptMarkersRtlHovered: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderFixture(context, { rtl: true, hovered: true }),
	}),
});
