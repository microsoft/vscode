/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';

export interface RHtmlDependency {
	all_files: boolean;
	head: string | null;
	meta: string | null;
	name: string | null;
	script: string | string[] | null;
	src: {
		file: string;
	};
	stylesheet: string | string[] | null;
	version: string | null;
}

export interface WidgetSizingPolicy {
	defaultHeight: string | null;
	defaultWidth: string | null;
	fill: boolean | null;
	padding: number | null;
}

export interface ViewerSizingPolicy extends WidgetSizingPolicy {
	paneHeight: number | null;
	suppress: boolean | null;
}

export interface BrowserSizingPolicy extends WidgetSizingPolicy {
	external: boolean | null;
}

export interface KnitrSizingPolicy extends WidgetSizingPolicy {
	figure: boolean | null;
}

export interface HtmlWidgetSizingPolicy extends WidgetSizingPolicy {
	viewer: ViewerSizingPolicy;
	browser: BrowserSizingPolicy;
	knitr: KnitrSizingPolicy;
}

export interface RHtmlWidget {
	dependencies: RHtmlDependency[];
	sizing_policy: HtmlWidgetSizingPolicy;
	tags: string;
}

export function getResourceRoots(widget: RHtmlWidget) {
	const roots: Uri[] = [];

	widget.dependencies.forEach((dep: RHtmlDependency) => {
		if (dep.src.file) {
			roots.push(Uri.file(dep.src.file));
		}
	});

	return Array.from(new Set(roots));
}
