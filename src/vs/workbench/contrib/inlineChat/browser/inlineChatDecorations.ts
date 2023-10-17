/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor, IEditorMouseEvent } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Selection } from 'vs/editor/common/core/selection';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { GutterActionsRegistry } from 'vs/workbench/contrib/codeEditor/browser/editorLineNumberMenu';
import { Action } from 'vs/base/common/actions';
import { CTX_INLINE_CHAT_VISIBLE, IInlineChatService } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';

const gutterInlineChatIcon = registerIcon('inline-chat', Codicon.sparkle, localize('startInlineChatIcon', 'Icon which spawns the inline chat from the gutter'));

export class InlineChatDecorationsContribution implements IEditorContribution {

	private disposableStore = new DisposableStore();

	private onProvidersChange: IDisposable;
	private numberOfProviders: number;

	private gutterDecorationsMap = new ResourceMap<{ id: string; lineNumber: number } | undefined>();
	private inlineChatLineNumber: number | undefined;

	public static readonly gutterSettingID = 'inlineChat.showGutterIcon';
	private static readonly gutterIconClassName = 'codicon-inline-chat';

	private static readonly GUTTER_DECORATION = ModelDecorationOptions.register({
		description: 'inline-chat-decoration',
		glyphMarginClassName: ThemeIcon.asClassName(gutterInlineChatIcon),
		glyphMargin: { position: GlyphMarginLane.Left },
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
	});

	constructor(
		private readonly editor: ICodeEditor,
		@IInlineChatService inlineChatService: IInlineChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		this.onProvidersChange = inlineChatService.onDidChangeProviders(() => {
			const numberOfProviders = [...inlineChatService.getAllProvider()].length;
			// If there were no providers and now there are providers, setup the contribution
			if (!this.numberOfProviders && numberOfProviders > 0) {
				this.setupGutterDecoration();
			}
			// If there were providers and now there are no providers, dispose the contribution
			if (this.numberOfProviders > 0 && !numberOfProviders) {
				this.clearState();
			}
			this.numberOfProviders = numberOfProviders;
		});
		this.numberOfProviders = [...inlineChatService.getAllProvider()].length;
		if (this.numberOfProviders > 0) {
			this.setupGutterDecoration();
		}
	}

	private setupGutterDecoration() {
		this.disposableStore.add(this.configurationService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(InlineChatDecorationsContribution.gutterSettingID)) {
				return;
			}
			const gutterIconEnabled = this.configurationService.getValue<boolean>(InlineChatDecorationsContribution.gutterSettingID);
			if (!gutterIconEnabled) {
				return;
			}
			this.activateGutterDecoration();
		}));
		const gutterIconEnabled = this.configurationService.getValue<boolean>(InlineChatDecorationsContribution.gutterSettingID);
		if (!gutterIconEnabled) {
			return;
		}
		this.activateGutterDecoration();
	}

	private activateGutterDecoration() {
		this.disposableStore.add(this.editor.onDidChangeCursorSelection(e => {
			if (!this.editor.hasModel()) {
				return;
			}
			this.updateGutterDecoration(this.editor.getModel().uri, e.selection);
		}));
		this.disposableStore.add(this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			if (!e.target.element?.classList.contains(InlineChatDecorationsContribution.gutterIconClassName)) {
				return;
			}
			const startLineNumber = this.editor.getSelection()?.startLineNumber;
			const sameLineNumber = startLineNumber === this.inlineChatLineNumber;
			const inlineChatVisible = this.contextKeyService.getContextKeyValue<boolean>(CTX_INLINE_CHAT_VISIBLE.key);
			if (sameLineNumber && inlineChatVisible) {
				return;
			}
			this.inlineChatLineNumber = startLineNumber;
			InlineChatController.get(this.editor)?.run();
		}));
		if (!this.editor.hasModel()) {
			return;
		}
		this.updateGutterDecoration(this.editor.getModel().uri, this.editor.getSelection());
	}

	private updateGutterDecoration(uri: URI, selection: Selection | null) {
		if (!selection) {
			this.removePreviousGutterDecoration(uri);
			this.gutterDecorationsMap.set(uri, undefined);
			return;
		}
		const startLineNumber = selection.startLineNumber;
		const textAtLineNumber = this.editor.getModel()?.getLineContent(selection.startLineNumber);
		const selectionLineIsEmpty = selection.isEmpty() && textAtLineNumber !== undefined && /^\s*$/g.test(textAtLineNumber);
		const decorationData = this.gutterDecorationsMap.get(uri);
		if (!decorationData) {
			return;
		}
		const sameLineNumber = decorationData.lineNumber === selection.startLineNumber;
		if (sameLineNumber) {
			if (selectionLineIsEmpty) {
				// Suppose there is already a decoration on the current line and the line is empty, then do not do anything
				return;
			}
			// Else the current line is not empty, then remove the decoration
			this.removePreviousGutterDecoration(uri);
			this.gutterDecorationsMap.set(uri, undefined);
		} else {
			// Suppose we are on a different line than where previous decoration was placed, then remove the previous decoration
			this.removePreviousGutterDecoration(uri);
			if (selectionLineIsEmpty) {
				// If current selection line is empty, add the decoration
				this.addDecoration(uri, startLineNumber);
				return;
			}
			this.gutterDecorationsMap.set(uri, undefined);
		}
	}

	private addDecoration(uri: URI, lineNumber: number) {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			const id = accessor.addDecoration(new Selection(lineNumber, 0, lineNumber, 0), InlineChatDecorationsContribution.GUTTER_DECORATION);
			this.gutterDecorationsMap.set(uri, { lineNumber, id });
		});
	}

	private removePreviousGutterDecoration(uri: URI) {
		this.editor.changeDecorations((accessor: IModelDecorationsChangeAccessor) => {
			const id = this.gutterDecorationsMap.get(uri)?.id;
			if (id) {
				accessor.removeDecoration(id);
			}
		});
	}

	private clearState() {
		this.disposableStore.dispose();
		this.inlineChatLineNumber = undefined;
	}

	dispose() {
		this.onProvidersChange.dispose();
		this.clearState();
	}
}

GutterActionsRegistry.registerGutterActionsGenerator(({ lineNumber, editor, accessor }, result) => {
	const configurationService = accessor.get(IConfigurationService);
	result.push(new Action(
		'inlineChat.toggleShowGutterIcon',
		localize('toggleShowGutterIcon', "Toggle Inline Chat Icon"),
		undefined,
		true,
		() => { configurationService.updateValue(InlineChatDecorationsContribution.gutterSettingID, !configurationService.getValue<boolean>(InlineChatDecorationsContribution.gutterSettingID)); }
	));
});
