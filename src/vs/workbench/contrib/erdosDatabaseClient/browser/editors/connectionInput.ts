/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDatabaseConnection } from '../../common/erdosDatabaseClientApi.js';

/**
 * Editor input for Connection editor.
 * Holds the database connection configuration.
 */
export class ConnectionInput extends EditorInput {

	static readonly ID = 'erdos.connectionInput';

	constructor(
		public initialConnection: IDatabaseConnection | undefined,
		public readonly isNewConnection: boolean,
		public readonly resource: URI
	) {
		super();
	}

	override get typeId(): string {
		return ConnectionInput.ID;
	}

	override get editorId(): string {
		return 'workbench.editors.erdosConnectionEditor';
	}

	override getName(): string {
		if (this.initialConnection?.name) {
			return `Connection - ${this.initialConnection.name}`;
		}
		return this.isNewConnection ? 'New Connection' : 'Edit Connection';
	}

	override getDescription(): string | undefined {
		if (this.initialConnection) {
			return `${this.initialConnection.dbType} - ${this.initialConnection.host}:${this.initialConnection.port}`;
		}
		return undefined;
	}

	override get capabilities(): number {
		return super.capabilities;
	}

	override matches(otherInput: EditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}

		if (otherInput instanceof ConnectionInput) {
			// Match based on connection ID if both have connections
			if (this.initialConnection && otherInput.initialConnection) {
				return this.initialConnection.id === otherInput.initialConnection.id;
			}
			// Match if both are new connections
			return this.isNewConnection && otherInput.isNewConnection;
		}

		return false;
	}

	public updateConnection(connection: IDatabaseConnection): void {
		this.initialConnection = connection;
		this._onDidChangeLabel.fire();
	}

	override dispose(): void {
		super.dispose();
	}
}
