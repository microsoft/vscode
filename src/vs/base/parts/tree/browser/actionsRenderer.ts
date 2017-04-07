/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./actionsRenderer';
import Lifecycle = require('vs/base/common/lifecycle');
import Builder = require('vs/base/browser/builder');
import Dom = require('vs/base/browser/dom');
import Actions = require('vs/base/common/actions');
import Events = require('vs/base/common/events');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import TreeDefaults = require('./treeDefaults');
import Tree = require('vs/base/parts/tree/browser/tree');

var $ = Builder.$;

export interface IActionsRendererOptions {
	actionProvider: Tree.IActionProvider;
	actionRunner?: Actions.IActionRunner;
}

export class ActionsRenderer extends TreeDefaults.LegacyRenderer implements Lifecycle.IDisposable {

	private static CONTENTS_CLEANUP_FN_KEY: string = '__$ActionsRenderer.contentCleanupFn';
	private static NO_OP = () => { /* noop */ };

	protected actionProvider: Tree.IActionProvider;
	protected actionRunner: Actions.IActionRunner;

	constructor(opts: IActionsRendererOptions) {
		super();
		this.actionProvider = opts.actionProvider;
		this.actionRunner = opts.actionRunner;
	}

	public getHeight(tree: Tree.ITree, element: any): number {
		return this.getContentHeight(tree, element);
	}

	protected render(tree: Tree.ITree, element: any, container: HTMLElement, previousCleanupFn?: Tree.IElementCallback): Tree.IElementCallback {
		try {
			Dom.clearNode(container);
		} catch (e) {
			if (!/The node to be removed is no longer a child of this node/.test(e.message)) {
				throw e;
			}
		}

		if (previousCleanupFn) {
			previousCleanupFn(tree, element);
		}

		var $container = $(container).addClass('actions');
		var $subContainer = $('.sub-content').appendTo($container);
		var actionBar: ActionBar.ActionBar;
		var actionBarListener: Lifecycle.IDisposable;

		if (this.actionProvider.hasActions(tree, element)) {
			$container.addClass('has-actions');

			actionBar = new ActionBar.ActionBar($('.primary-action-bar').appendTo($container), {
				context: this.getActionContext(tree, element),
				actionItemProvider: a => this.actionProvider.getActionItem(tree, element, a),
				actionRunner: this.actionRunner
			});

			this.actionProvider.getActions(tree, element).then((actions) => {
				actionBar.push(actions, { icon: true, label: false });
			});

			actionBarListener = actionBar.addListener2(Events.EventType.RUN, (event: any) => {
				if (event.error) {
					this.onError(event.error);
				}
			});
		} else {
			$container.removeClass('has-actions');
		}

		var previousContentsCleanupFn = (previousCleanupFn ? previousCleanupFn[ActionsRenderer.CONTENTS_CLEANUP_FN_KEY] : ActionsRenderer.NO_OP) || ActionsRenderer.NO_OP;
		previousContentsCleanupFn(tree, element);

		var contentsCleanupFn = this.renderContents(tree, element, $subContainer.getHTMLElement(), null);

		var cleanupFn = () => {
			if (actionBarListener) {
				actionBarListener.dispose();
			}

			if (actionBar) {
				actionBar.dispose();
			}

			if (contentsCleanupFn) {
				contentsCleanupFn(tree, element);
			}
		};

		cleanupFn[ActionsRenderer.CONTENTS_CLEANUP_FN_KEY] = contentsCleanupFn;

		return cleanupFn;
	}

	/* protected */ public getContentHeight(tree: Tree.ITree, element: any): number {
		return 20;
	}

	/* protected */ public renderContents(tree: Tree.ITree, element: any, container: HTMLElement, previousCleanupFn: Tree.IElementCallback): Tree.IElementCallback {
		return null;
	}

	/* protected */ public getActionContext(tree: Tree.ITree, element: any): any {
		return null;
	}

	/* protected */ public onError(error: any): void {
		return;
	}

	public dispose(): void {
		this.actionProvider = null;
	}
}
