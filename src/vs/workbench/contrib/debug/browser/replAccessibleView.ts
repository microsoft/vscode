/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IReplElement } from '../common/debug.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { getReplView, Repl } from './repl.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../../editor/common/core/position.js';

export class ReplAccessibleView implements IAccessibleViewImplementation {
	priority = 70;
	name = 'debugConsole';
	when = ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view');
	type: AccessibleViewType = AccessibleViewType.View;
	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const replView = getReplView(viewsService);
		if (!replView) {
			return undefined;
		}

		const focusedElement = replView.getFocusedElement();
		return new ReplOutputAccessibleViewProvider(replView, focusedElement, accessibleViewService);
	}
}

class ReplOutputAccessibleViewProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.Repl;
	private _content: string | undefined;
	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	private readonly _onDidResolveChildren: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidResolveChildren: Event<void> = this._onDidResolveChildren.event;

	public readonly verbositySettingKey = AccessibilityVerbositySettingId.Debug;
	public readonly options = {
		type: AccessibleViewType.View
	};

	private _elementPositionMap: Map<string, Position> = new Map<string, Position>();
	private _treeHadFocus = false;

	constructor(
		private readonly _replView: Repl,
		private readonly _focusedElement: IReplElement | undefined,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService) {
		super();
		this._treeHadFocus = !!_focusedElement;
	}
	public provideContent(): string {
		const debugSession = this._replView.getDebugSession();
		if (!debugSession) {
			return 'No debug session available.';
		}
		const elements = debugSession.getReplElements();
		if (!elements.length) {
			return 'No output in the debug console.';
		}
		if (!this._content) {
			this._updateContent(elements);
		}
		// Content is loaded asynchronously, so we need to check if it's available or fallback to the elements that are already available.
		return this._content ?? elements.map(e => e.toString(true)).join('\n');
	}

	public onClose(): void {
		this._content = undefined;
		this._elementPositionMap.clear();
		if (this._treeHadFocus) {
			return this._replView.focusTree();
		}
		this._replView.getReplInput().focus();
	}

	public onOpen(): void {
		// Children are resolved async, so we need to update the content when they are resolved.
		this._register(this.onDidResolveChildren(() => {
			this._onDidChangeContent.fire();
			queueMicrotask(() => {
				if (this._focusedElement) {
					const position = this._elementPositionMap.get(this._focusedElement.getId());
					if (position) {
						this._accessibleViewService.setPosition(position, true);
					}
				}
			});
		}));
	}

	private async _updateContent(elements: IReplElement[]) {
		const dataSource = this._replView.getReplDataSource();
		if (!dataSource) {
			return;
		}
		let line = 1;
		const content: string[] = [];
		for (const e of elements) {
			content.push(e.toString().replace(/\n/g, ''));
			this._elementPositionMap.set(e.getId(), new Position(line, 1));
			line++;
			if (dataSource.hasChildren(e)) {
				const childContent: string[] = [];
				const children = await dataSource.getChildren(e);
				for (const child of children) {
					const id = child.getId();
					if (!this._elementPositionMap.has(id)) {
						// don't overwrite parent position
						this._elementPositionMap.set(id, new Position(line, 1));
					}
					childContent.push('  ' + child.toString());
					line++;
				}
				content.push(childContent.join('\n'));
			}
		}

		this._content = content.join('\n');
		this._onDidResolveChildren.fire();
	}
}
