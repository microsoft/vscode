/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFastDomNode, FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CellKind } from '../../common/notebookCommon.js';
import { getNotebookEditorFromEditorPane, INotebookCellOverlay, INotebookCellOverlayChangeAccessor, INotebookViewCellsUpdateEvent } from '../notebookBrowser.js';
import { NotebookCellListView } from '../view/notebookCellListView.js';
import { CellViewModel } from '../viewModel/notebookViewModelImpl.js';

interface INotebookCellOverlayWidget {
	overlayId: string;
	overlay: INotebookCellOverlay;
	domNode: FastDomNode<HTMLElement>;
}

export class NotebookCellOverlays extends Disposable {
	private _lastOverlayId = 0;
	public domNode: FastDomNode<HTMLElement>;
	private _overlays: { [key: string]: INotebookCellOverlayWidget } = Object.create(null);

	constructor(
		private readonly listView: NotebookCellListView<CellViewModel>
	) {
		super();
		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('cell-overlays');
		this.domNode.setPosition('absolute');
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');
		this.domNode.setWidth('100%');

		this.listView.containerDomNode.appendChild(this.domNode.domNode);
	}

	changeCellOverlays(callback: (changeAccessor: INotebookCellOverlayChangeAccessor) => void): boolean {
		let overlaysHaveChanged = false;
		const changeAccessor: INotebookCellOverlayChangeAccessor = {
			addOverlay: (overlay: INotebookCellOverlay): string => {
				overlaysHaveChanged = true;
				return this._addOverlay(overlay);
			},
			removeOverlay: (id: string): void => {
				overlaysHaveChanged = true;
				this._removeOverlay(id);
			},
			layoutOverlay: (id: string): void => {
				overlaysHaveChanged = true;
				this._layoutOverlay(id);
			}
		};

		callback(changeAccessor);

		return overlaysHaveChanged;
	}

	onCellsChanged(e: INotebookViewCellsUpdateEvent): void {
		this.layout();
	}

	onHiddenRangesChange() {
		this.layout();
	}

	layout() {
		for (const id in this._overlays) {
			this._layoutOverlay(id);
		}
	}

	private _addOverlay(overlay: INotebookCellOverlay): string {
		const overlayId = `${++this._lastOverlayId}`;

		const overlayWidget = {
			overlayId,
			overlay,
			domNode: createFastDomNode(overlay.domNode)
		};

		this._overlays[overlayId] = overlayWidget;
		overlayWidget.domNode.setClassName('cell-overlay');
		overlayWidget.domNode.setPosition('absolute');
		this.domNode.appendChild(overlayWidget.domNode);

		return overlayId;
	}

	private _removeOverlay(id: string): void {
		const overlay = this._overlays[id];
		if (overlay) {
			// overlay.overlay.dispose();
			try {
				this.domNode.removeChild(overlay.domNode);
			} catch {
				// no op
			}

			delete this._overlays[id];
		}
	}

	private _layoutOverlay(id: string): void {
		const overlay = this._overlays[id];
		if (!overlay) {
			return;
		}

		const isInHiddenRanges = this._isInHiddenRanges(overlay);
		if (isInHiddenRanges) {
			overlay.domNode.setDisplay('none');
			return;
		}

		overlay.domNode.setDisplay('block');
		const index = this.listView.indexOf(overlay.overlay.cell as CellViewModel);
		if (index === -1) {
			// should not happen
			return;
		}

		const top = this.listView.elementTop(index);
		overlay.domNode.setTop(top);
	}

	private _isInHiddenRanges(zone: INotebookCellOverlayWidget) {
		const index = this.listView.indexOf(zone.overlay.cell as CellViewModel);
		if (index === -1) {
			return true;
		}

		return false;
	}
}



class ToggleNotebookCellOverlaysDeveloperAction extends Action2 {
	static cellOverlayIds: string[] = [];
	constructor() {
		super({
			id: 'notebook.developer.addCellOverlays',
			title: localize2('workbench.notebook.developer.addCellOverlays', "Toggle Notebook Cell Overlays"),
			category: Categories.Developer,
			precondition: IsDevelopmentContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		if (ToggleNotebookCellOverlaysDeveloperAction.cellOverlayIds.length > 0) {
			// remove all view zones
			editor.changeCellOverlays(accessor => {
				ToggleNotebookCellOverlaysDeveloperAction.cellOverlayIds.forEach(id => {
					accessor.removeOverlay(id);
				});
				ToggleNotebookCellOverlaysDeveloperAction.cellOverlayIds = [];
			});
		} else {
			editor.changeCellOverlays(accessor => {
				const cells = editor.getCellsInRange();
				if (cells.length === 0) {
					return;
				}

				const cellOverlayIds: string[] = [];
				for (let i = 0; i < cells.length; i++) {
					if (cells[i].cellKind !== CellKind.Markup) {
						continue;
					}
					const domNode = document.createElement('div');
					domNode.innerText = `Cell Overlay ${i}`;
					domNode.style.top = '10px';
					domNode.style.right = '10px';
					domNode.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
					const overlayId = accessor.addOverlay({
						cell: cells[i],
						domNode: domNode,
					});

					cellOverlayIds.push(overlayId);
				}
				ToggleNotebookCellOverlaysDeveloperAction.cellOverlayIds = cellOverlayIds;
			});
		}
	}
}

registerAction2(ToggleNotebookCellOverlaysDeveloperAction);
