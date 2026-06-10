/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IInteractiveDocumentService = createDecorator<IInteractiveDocumentService>('IInteractiveDocumentService');

export interface IInteractiveDocumentService {
	readonly _serviceBrand: undefined;
	readonly onWillAddInteractiveDocument: Event<{ notebookUri: URI; inputUri: URI; languageId: string }>;
	readonly onWillRemoveInteractiveDocument: Event<{ notebookUri: URI; inputUri: URI }>;
	willCreateInteractiveDocument(notebookUri: URI, inputUri: URI, languageId: string): void;
	willRemoveInteractiveDocument(notebookUri: URI, inputUri: URI): void;
}

export class InteractiveDocumentService extends Disposable implements IInteractiveDocumentService {
	declare readonly _serviceBrand: undefined;
	private readonly _onWillAddInteractiveDocument = this._register(new Emitter<{ notebookUri: URI; inputUri: URI; languageId: string }>());
	onWillAddInteractiveDocument = this._onWillAddInteractiveDocument.event;
	private readonly _onWillRemoveInteractiveDocument = this._register(new Emitter<{ notebookUri: URI; inputUri: URI }>());
	onWillRemoveInteractiveDocument = this._onWillRemoveInteractiveDocument.event;

	constructor() {
		super();
	}

	willCreateInteractiveDocument(notebookUri: URI, inputUri: URI, languageId: string) {
		this._onWillAddInteractiveDocument.fire({
			notebookUri,
			inputUri,
			languageId
		});
	}

	willRemoveInteractiveDocument(notebookUri: URI, inputUri: URI) {
		this._onWillRemoveInteractiveDocument.fire({
			notebookUri,
			inputUri
		});
	}
}
