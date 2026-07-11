/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../../base/common/color.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorLayoutInfo } from '../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { AgentFeedbackEditorInputContribution, AgentFeedbackInputWidget } from '../../browser/agentFeedbackEditorInputContribution.js';
import { IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { ISession, ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../browser/media/agentFeedbackEditorInput.css';

const sessionResource = URI.parse('vscode-agent-session://fixture/session-1');
const fileResource = URI.parse('inmemory://model/agent-feedback-input.ts');

const sampleCode = [
	'function alpha() {',
	'\tconst first = 1;',
	'\treturn first;',
	'}',
	'',
	'function beta() {',
	'\tconst second = 2;',
	'\tconst third = second + 1;',
	'\treturn third;',
	'}',
].join('\n');

function ensureTokenColorMap(): void {
	if (TokenizationRegistry.getColorMap()?.length) {
		return;
	}
	TokenizationRegistry.setColorMap([
		Color.fromHex('#000000'),
		Color.fromHex('#d4d4d4'),
		Color.fromHex('#9cdcfe'),
		Color.fromHex('#ce9178'),
		Color.fromHex('#b5cea8'),
		Color.fromHex('#569cd6'),
		Color.fromHex('#dcdcaa'),
	]);
}

interface IInputFixtureOptions {
	/** Initial text in the input. Empty renders the placeholder state. */
	readonly text?: string;
	/** Placeholder to show — "Add Feedback" (has changes) vs "Add Comment". */
	readonly placeholder?: string;
}

/**
 * A minimal {@link ICodeEditor} stand-in for the standalone variants. The input
 * widget only reads layout geometry ({@link ICodeEditor.getLayoutInfo}) and asks
 * the editor to re-layout itself ({@link ICodeEditor.layoutOverlayWidget}), so a
 * mock that provides just those two is enough to render it on its own.
 */
function createFakeEditor(): ICodeEditor {
	return new class extends mock<ICodeEditor>() {
		override getLayoutInfo(): EditorLayoutInfo {
			// Only `width` and `contentLeft` are read (to clamp the input width).
			// eslint-disable-next-line local/code-no-dangerous-type-assertions
			return { width: 520, contentLeft: 64 } as EditorLayoutInfo;
		}
		override layoutOverlayWidget(): void { }
	}();
}

/** Renders the input widget on its own — the widget's own DOM/CSS in isolation. */
function renderInputWidget(context: ComponentFixtureContext, options: IInputFixtureOptions): void {
	// The widget is `position: absolute`, so give it a positioned host with
	// room, and let it flow statically so it is fully captured (not clipped).
	context.container.style.position = 'relative';
	context.container.style.width = '520px';
	context.container.style.padding = '24px';
	context.container.style.background = 'var(--vscode-editor-background)';

	const widget = context.disposableStore.add(new AgentFeedbackInputWidget(createFakeEditor()));
	const domNode = widget.getDomNode();
	domNode.style.position = 'static';
	// When absolutely positioned (as in the editor) the widget shrinks to its
	// content. Flowing it statically would instead stretch the flex container to
	// the host width, so pin it to its content width to preserve the real layout.
	domNode.style.width = 'fit-content';
	domNode.style.animation = 'none';
	context.container.appendChild(domNode);

	if (options.placeholder) {
		widget.setPlaceholder(options.placeholder);
	}
	if (options.text) {
		widget.inputElement.value = options.text;
	}

	// Reveal (it starts hidden) and let it size itself + enable/disable actions
	// exactly as the contribution does after mounting it.
	widget.show();
	widget.updateActionEnabled();
	widget.autoSize();
}

/** A session whose feedback scopes {@link fileResource}, for the mock service. */
function createFixtureSession(): ISession {
	const changes = observableValue<readonly ISessionFileChange[]>('agentFeedbackFixtureChanges', []);
	return new class extends mock<ISession>() {
		override readonly resource = sessionResource;
		override readonly changes = changes;
	}();
}

/**
 * Renders the input widget the way production does: by instantiating the real
 * {@link AgentFeedbackEditorInputContribution} on a real editor and letting it
 * create, show and position the widget. The contribution requires chat to be
 * enabled and the file to be owned by a session, so both are stubbed here, then
 * its public {@link AgentFeedbackEditorInputContribution.showAtCurrentLine} entry
 * point (also used by the "add feedback at current line" command) is invoked to
 * summon the box — exercising the real placement instead of re-implementing it.
 */
function renderInEditor(context: ComponentFixtureContext): Promise<void> {
	const scopedDisposables = context.disposableStore.add(new DisposableStore());
	context.container.style.width = '760px';
	context.container.style.height = '260px';
	context.container.style.border = '1px solid var(--vscode-editorWidget-border)';
	context.container.style.background = 'var(--vscode-editor-background)';

	ensureTokenColorMap();

	const session = createFixtureSession();
	const agentFeedbackService = new class extends mock<IAgentFeedbackService>() {
		override readonly onDidChangeFeedback = Event.None;
		override readonly onDidChangeNavigation = Event.None;
		override getSessionForFile(resourceUri: URI): ISession | undefined {
			return isEqual(resourceUri, fileResource) ? session : undefined;
		}
		override getFeedback() {
			return [];
		}
	}();

	// The contribution only offers the input when chat is enabled. The fixtures'
	// default MockContextKeyService reports every rule as unmatched, so provide a
	// variant that reports the chat-enabled gate as satisfied.
	const contextKeyService = new class extends MockContextKeyService {
		override contextMatchesRules(): boolean { return true; }
	}();

	const instantiationService = createEditorServices(scopedDisposables, {
		colorTheme: context.theme,
		additionalServices: reg => {
			reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
			reg.defineInstance(IContextKeyService, contextKeyService);
		},
	});

	const model = scopedDisposables.add(createTextModel(instantiationService, sampleCode, fileResource, 'typescript'));
	const editor = scopedDisposables.add(instantiationService.createInstance(
		CodeEditorWidget,
		context.container,
		{
			automaticLayout: false,
			lineNumbers: 'on',
			minimap: { enabled: false },
			scrollBeyondLastLine: false,
			fontSize: 13,
			lineHeight: 20,
		},
		{ contributions: [] },
	));
	editor.setModel(model);
	// Lay out synchronously so the contribution positions/sizes the widget
	// against real geometry (automaticLayout would settle asynchronously, after
	// the box has already been placed against a zero-size editor).
	editor.layout({ width: 760, height: 260 });

	const contribution = scopedDisposables.add(instantiationService.createInstance(AgentFeedbackEditorInputContribution, editor));

	// Put the cursor on the line to comment on and let the contribution create,
	// show and position the input exactly as the command does in production.
	editor.setPosition(new Position(7, 1));
	contribution.showAtCurrentLine(false);

	// Let the DOM settle, then trigger a layout change so the contribution
	// re-measures and re-positions the (now measurable) widget against real
	// geometry — this is the same reposition path it runs on editor resize.
	return new Promise<void>(resolve => {
		// this is fine in fixtures
		// eslint-disable-next-line no-restricted-globals
		requestAnimationFrame(() => {
			editor.layout({ width: 759, height: 260 });
			editor.layout({ width: 760, height: 260 });
			resolve();
		});
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/agentFeedback/' }, {
	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderInputWidget(context, {}),
	}),

	AddComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderInputWidget(context, { placeholder: 'Add Comment' }),
	}),

	WithText: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderInputWidget(context, { text: 'Prefer a clearer variable name on this line.' }),
	}),

	MultilineText: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderInputWidget(context, {
			text: 'This branch needs a stronger explanation.\nAlso consider extracting it into a helper so the intent is explicit.',
		}),
	}),

	InEditor: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderInEditor(context),
	}),
});
