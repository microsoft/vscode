/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IDatabaseClientService } from '../services/databaseClientService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { DatabaseStatus } from '../components/DatabaseStatus.js';
import { DatabaseType, IDatabaseStatus } from '../../common/erdosDatabaseClientApi.js';

// Re-export for use in contribution file
export { DatabaseType };

export class DatabaseStatusEditorInput extends EditorInput {
	static readonly ID = 'erdos.databaseStatusEditorInput';

	constructor(
		public readonly connectionId: string,
		public readonly connectionName: string,
		public readonly databaseType: DatabaseType,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return DatabaseStatusEditorInput.ID;
	}

	override get editorId(): string {
		return 'erdos.databaseStatusEditor';
	}

	override getName(): string {
		return `Status@${this.connectionName}`;
	}

	override getDescription(): string {
		return `Database Server Status - ${this.connectionName}`;
	}


	override matches(other: EditorInput): boolean {
		return other instanceof DatabaseStatusEditorInput && 
			   other.connectionId === this.connectionId;
	}

}

export class DatabaseStatusEditor extends EditorPane {
	static readonly ID = 'erdos.databaseStatusEditor';

	private _container!: HTMLElement;
	private _reactRoot: ReactDOM.Root | undefined;
	private _currentInput: DatabaseStatusEditorInput | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDatabaseClientService private readonly _databaseClientService: IDatabaseClientService,
		@INotificationService private readonly _notificationService: INotificationService
	) {
		super(DatabaseStatusEditor.ID, group, _telemetryService, themeService, storageService);
	}

	override async setInput(input: DatabaseStatusEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._currentInput = input;
		this._render();
	}

	override clearInput(): void {
		this._destroyReactComponent();
		this._currentInput = undefined;
		super.clearInput();
	}

	protected override createEditor(parent: HTMLElement): void {
		this._container = parent;
		this._container.style.overflow = 'hidden';
		this._render();
	}

	override layout(dimension: Dimension): void {
		if (this._container) {
			this._container.style.width = `${dimension.width}px`;
			this._container.style.height = `${dimension.height}px`;
		}
	}

	private _render(): void {
		if (!this._container || !this._currentInput) {
			return;
		}

		// Destroy existing React component
		this._destroyReactComponent();

		// Create new React root
		this._reactRoot = ReactDOM.createRoot(this._container);

		const props = {
			connectionId: this._currentInput.connectionId,
			databaseType: this._currentInput.databaseType,
			onGetDatabaseStatus: this._handleGetDatabaseStatus.bind(this),
			onShowMessage: this._handleShowMessage.bind(this)
		};

		this._reactRoot.render(
			React.createElement(DatabaseStatus, props)
		);
	}

	private async _handleGetDatabaseStatus(connectionId: string): Promise<IDatabaseStatus> {
		try {
			return await this._databaseClientService.getDatabaseStatus(connectionId);
		} catch (error) {
			this._handleShowMessage(`Failed to load database status: ${error.message}`, 'error');
			throw error;
		}
	}

	private _handleShowMessage(message: string, type: 'info' | 'warning' | 'error' | 'success'): void {
		switch (type) {
			case 'error':
				this._notificationService.error(message);
				break;
			case 'warning':
				this._notificationService.warn(message);
				break;
			case 'success':
			case 'info':
			default:
				this._notificationService.info(message);
				break;
		}
	}

	private _destroyReactComponent(): void {
		if (this._reactRoot) {
			this._reactRoot.unmount();
			this._reactRoot = undefined;
		}
	}

	override dispose(): void {
		this._destroyReactComponent();
		super.dispose();
	}
}
