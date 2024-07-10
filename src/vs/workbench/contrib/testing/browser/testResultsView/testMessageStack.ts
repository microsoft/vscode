/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListRenderer, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { ITestMessageStackFrame } from 'vs/workbench/contrib/testing/common/testTypes';
import { IEditorService, SIDE_GROUP } from 'vs/workbench/services/editor/common/editorService';

const stackItemDelegate: IListVirtualDelegate<void> = {
	getHeight: () => 22,
	getTemplateId: () => 's',
};

export class TestResultStackWidget extends Disposable {
	private readonly list: WorkbenchList<ITestMessageStackFrame>;
	private readonly changeStackFrameEmitter = this._register(new Emitter<ITestMessageStackFrame>());

	public readonly onDidChangeStackFrame = this.changeStackFrameEmitter.event;

	constructor(
		private readonly container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILabelService labelService: ILabelService,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super();

		this.list = this._register(instantiationService.createInstance(
			WorkbenchList,
			'TestResultStackWidget',
			container,
			stackItemDelegate,
			[instantiationService.createInstance(StackRenderer)],
			{
				multipleSelectionSupport: false,
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('testStackTrace', 'Test stack trace'),
					getAriaLabel: (e: ITestMessageStackFrame) => e.position && e.uri ? localize({
						comment: ['{0} is an extension-defined label, then line number and filename'],
						key: 'stackTraceLabel',
					}, '{0}, line {1} in {2}', e.label, e.position.lineNumber, labelService.getUriLabel(e.uri, { relative: true })) : e.label,
				}
			}
		) as WorkbenchList<ITestMessageStackFrame>);

		this._register(this.list.onDidChangeSelection(e => {
			if (e.elements.length) {
				this.changeStackFrameEmitter.fire(e.elements[0]);
			}
		}));

		this._register(dom.addDisposableListener(container, dom.EventType.CONTEXT_MENU, e => {
			contextMenuService.showContextMenu({
				getAnchor: () => ({ x: e.x, y: e.y }),
				menuId: MenuId.TestCallStackContext
			});
		}));
	}

	public update(stack: ITestMessageStackFrame[], selection?: ITestMessageStackFrame) {
		this.list.splice(0, this.list.length, stack);
		this.list.layout();

		const i = selection && stack.indexOf(selection);
		if (i && i !== -1) {
			this.list.setSelection([i]);
			this.list.setFocus([i]);
			// selection is triggered actioning on the call stack from a different
			// editor, ensure the stack item is still focused in this editor
			this.list.domFocus();
		}
	}

	public layout(height?: number, width?: number) {
		this.list.layout(height ?? this.container.clientHeight, width);
	}
}

interface ITemplateData {
	container: HTMLElement;
	label: HTMLElement;
	location: HTMLElement;
	current?: ITestMessageStackFrame;
	disposable: IDisposable;
}

class StackRenderer implements IListRenderer<ITestMessageStackFrame, ITemplateData> {
	public readonly templateId = 's';

	constructor(
		@ILabelService private readonly labelService: ILabelService,
		@IEditorService private readonly openerService: IEditorService,
	) { }

	renderTemplate(container: HTMLElement): ITemplateData {
		const label = dom.$('.label');
		const location = dom.$('.location');
		container.appendChild(label);
		container.appendChild(location);
		const data: ITemplateData = {
			container,
			label,
			location,
			disposable: dom.addDisposableListener(container, dom.EventType.CLICK, e => {
				if (e.ctrlKey || e.metaKey) {
					if (data.current?.uri) {
						this.openerService.openEditor({
							resource: data.current.uri,
							options: {
								selection: data.current.position ? Range.fromPositions(data.current.position) : undefined,
							}
						}, SIDE_GROUP);
						e.preventDefault();
						e.stopPropagation();
					}
				}
			}),
		};

		return data;
	}

	renderElement(element: ITestMessageStackFrame, index: number, templateData: ITemplateData, height: number | undefined): void {
		templateData.label.innerText = element.label;
		templateData.current = element;
		templateData.container.classList.toggle('no-source', !element.uri);

		if (element.uri) {
			templateData.location.innerText = this.labelService.getUriBasenameLabel(element.uri);
			templateData.location.title = this.labelService.getUriLabel(element.uri, { relative: true });
			if (element.position) {
				templateData.location.innerText += `:${element.position.lineNumber}:${element.position.column}`;
			}
		}
	}

	disposeTemplate(templateData: ITemplateData): void {
		templateData.disposable.dispose();
	}
}

