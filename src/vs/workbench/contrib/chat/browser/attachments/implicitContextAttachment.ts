/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { FileKind } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ResourceLabels } from '../../../../browser/labels.js';
import { IChatRequestImplicitVariableEntry } from '../../common/chatModel.js';

export class ImplicitContextAttachmentWidget extends Disposable {
	public readonly domNode: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());

	constructor(
		private readonly attachment: IChatRequestImplicitVariableEntry,
		private readonly resourceLabels: ResourceLabels,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this.domNode = dom.$('.chat-attached-context-attachment.show-file-icons.implicit');

		// this._register(Event.runAndSubscribe(
		// 	attachment.onDidChangeValue,
		// 	() => this.render()
		// ));
		this.render();
	}

	private render() {
		dom.clearNode(this.domNode);
		this.renderDisposables.clear();

		this.domNode.classList.toggle('disabled', !this.attachment.enabled);
		const label = this.resourceLabels.create(this.domNode, { supportIcons: true });
		const file = URI.isUri(this.attachment.value) ? this.attachment.value : this.attachment.value!.uri;
		const range = URI.isUri(this.attachment.value) ? undefined : this.attachment.value!.range;

		const fileBasename = basename(file);
		const fileDirname = dirname(file);
		const friendlyName = `${fileBasename} ${fileDirname}`;
		const ariaLabel = range ? localize('chat.fileAttachmentWithRange', "Attached file, {0}, line {1} to line {2}", friendlyName, range.startLineNumber, range.endLineNumber) : localize('chat.fileAttachment', "Attached file, {0}", friendlyName);

		const uriLabel = this.labelService.getUriLabel(file);
		const openEditor = localize('openEditor', "Open Editor");
		const inactive = localize('inactive', "inactive");
		const openEditorHint = openEditor + (this.attachment.enabled ? '' : ` (${inactive})`);
		label.setFile(file, {
			fileKind: FileKind.FILE,
			hidePath: true,
			range,
			title: `${openEditorHint}\n${uriLabel}`
		});
		this.domNode.ariaLabel = ariaLabel;
		this.domNode.tabIndex = 0;
		this.domNode.appendChild(dom.$('span.chat-implicit-hint', undefined, 'Current file'));

		if (this.attachment.enabled) {
			const clearButton = this.renderDisposables.add(new Button(this.domNode, { supportIcons: true }));
			clearButton.icon = Codicon.close;
			this.renderDisposables.add(clearButton.onDidClick((e) => {
				e.stopPropagation(); // prevent it from triggering the click handler on the parent immediately after rerendering
				this.attachment.enabled = !this.attachment.enabled;
			}));
		} else {
			this.renderDisposables.add(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, () => {
				this.attachment.enabled = !this.attachment.enabled;
			}));
			this.renderDisposables.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_UP, e => {
				const keyboardEvent = new StandardKeyboardEvent(e);
				if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
					this.attachment.enabled = !this.attachment.enabled;
				}
			}));
		}
	}
}
