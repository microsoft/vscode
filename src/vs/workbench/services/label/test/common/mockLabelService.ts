/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { basename, normalize } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFormatterChangeEvent, ILabelService, ResourceLabelFormatter, Verbosity } from 'vs/platform/label/common/label';
import { IWorkspace, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class MockLabelService implements ILabelService {
	_serviceBrand: undefined;

	registerCachedFormatter(formatter: ResourceLabelFormatter): IDisposable {
		throw new Error('Method not implemented.');
	}
	getUriLabel(resource: URI, options?: { relative?: boolean | undefined; noPrefix?: boolean | undefined }): string {
		return normalize(resource.fsPath);
	}
	getUriBasenameLabel(resource: URI): string {
		return basename(resource.fsPath);
	}
	getWorkspaceLabel(workspace: URI | IWorkspaceIdentifier | IWorkspace, options?: { verbose: Verbosity }): string {
		return '';
	}
	getHostLabel(scheme: string, authority?: string): string {
		return '';
	}
	public getHostTooltip(): string | undefined {
		return '';
	}
	getSeparator(scheme: string, authority?: string): '/' | '\\' {
		return '/';
	}
	registerFormatter(formatter: ResourceLabelFormatter): IDisposable {
		return Disposable.None;
	}
	onDidChangeFormatters: Event<IFormatterChangeEvent> = new Emitter<IFormatterChangeEvent>().event;
}
