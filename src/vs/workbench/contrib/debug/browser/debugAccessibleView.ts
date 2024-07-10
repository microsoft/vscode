/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IDebugService, IReplElement } from 'vs/workbench/contrib/debug/common/debug';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { getReplView, Repl } from 'vs/workbench/contrib/debug/browser/repl';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

export class DebugAccessibleView extends Disposable implements IAccessibleViewImplentation {
	priority = 70;
	name = 'debugConsole';
	when = ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view');
	type: AccessibleViewType = AccessibleViewType.View;
	constructor() {
		super();
	}
	getProvider(accessor: ServicesAccessor) {
		const viewsService = accessor.get(IViewsService);
		const debugService = accessor.get(IDebugService);
		return this._register(new DebugAccessibleViewProvider(viewsService, debugService));
	}
}

class DebugAccessibleViewProvider extends Disposable implements IAccessibleViewContentProvider {
	public readonly id = AccessibleViewProviderId.DebugConsole;
	private _content: string | undefined;
	private readonly _onDidChangeContent: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	private readonly _onDidResolveChildren: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidResolveChildren: Event<void> = this._onDidResolveChildren.event;

	public readonly verbositySettingKey = AccessibilityVerbositySettingId.DebugConsole;
	public readonly options = {
		type: AccessibleViewType.View
	};

	private readonly _replView: Repl | undefined;
	constructor(
		@IViewsService private readonly _viewsService: IViewsService,
		@IDebugService private readonly _debugService: IDebugService) {
		super();
		this._replView = getReplView(this._viewsService);
		if (!this._replView) {
			throw new Error('Repl view not found');
		}
	}
	public provideContent(): string {
		if (!this._replView) {
			throw new Error('Repl view not found, cannot provide content');
		}

		const viewModel = this._debugService.getViewModel();

		const focusedDebugSession = viewModel?.focusedSession;
		if (!focusedDebugSession) {
			return '';
		}
		const elements = focusedDebugSession.getReplElements();
		if (!elements.length) {
			return '';
		}
		if (!this._content) {
			this._evaluateChildren(elements);
		}
		return this._content ?? elements.map(e => e.toString(true)).join('\n');
	}

	public onClose(): void {
		this._content = undefined;
		this._replView?.focusTree();
	}

	public onOpen(): void {
		// Children are resolved async, so we need to update the content when they are resolved.
		this._register(this.onDidResolveChildren(() => this._onDidChangeContent.fire()));
	}

	private async _evaluateChildren(elements: IReplElement[]) {
		const dataSource = this._replView?.getReplDataSource();
		if (!dataSource) {
			return;
		}
		const content: string[] = [];
		for (const e of elements) {
			content.push(e.toString(true));
			if (dataSource.hasChildren(e)) {
				const children = await dataSource.getChildren(e);
				content.push(children.map(c => c.toString(true)).join('\n'));
			}
		}

		this._content = content.join('\n');
		this._onDidResolveChildren.fire();
	}
}
