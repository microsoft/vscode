/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedObservableWithCache, derivedOpts, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { equals as arraysEqual } from '../../../../base/common/arrays.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { comparePaths } from '../../../../base/common/comparers.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ISessionChangesService } from './sessionChangesService.js';

function compareChanges(a: ISessionFileChange, b: ISessionFileChange): number {
	const aPath = isIChatSessionFileChange2(a) ? a.uri.fsPath : a.modifiedUri.fsPath;
	const bPath = isIChatSessionFileChange2(b) ? b.uri.fsPath : b.modifiedUri.fsPath;
	return comparePaths(aPath, bPath);
}

export class ChangesMultiDiffSourceResolver extends Disposable implements IMultiDiffSourceResolver {

	constructor(
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return this._sessionChangesService.getSessionResource(uri) !== undefined;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const sessionResource = this._sessionChangesService.getSessionResource(uri)!;

		const changesObs = derivedObservableWithCache<readonly ISessionFileChange[]>({
			owner: this,
		}, (reader, lastValue) => {
			if (this.changesViewService.activeSessionIsLoadingObs.read(reader)) {
				return lastValue ?? [];
			}

			const activeSessionResource = this.changesViewService.activeSessionResourceObs.read(reader);
			if (!activeSessionResource || !isEqual(activeSessionResource, sessionResource)) {
				return lastValue ?? [];
			}

			return this.changesViewService.activeSessionChangesObs.read(reader);
		});

		const resourcesObs = derivedOpts<readonly MultiDiffEditorItem[]>({
			owner: this,
			equalsFn: (a, b) => arraysEqual(a, b, (x, y) =>
				isEqual(x.originalUri, y.originalUri) &&
				isEqual(x.modifiedUri, y.modifiedUri)),
		}, reader => {
			const changes = changesObs.read(reader);
			return [...changes].sort(compareChanges).map(change =>
				new MultiDiffEditorItem(change.originalUri, change.modifiedUri, change.modifiedUri));
		});

		return { resources: new ValueWithChangeEventFromObservable(resourcesObs) };
	}
}
