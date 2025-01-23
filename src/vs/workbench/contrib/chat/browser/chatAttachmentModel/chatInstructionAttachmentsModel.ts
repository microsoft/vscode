/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IChatRequestVariableEntry } from '../../common/chatModel.js';
import { ChatInstructionsFileLocator } from './chatInstructionsFileLocator.js';
import { ChatInstructionsAttachmentModel } from './chatInstructionsAttachment.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { BasePromptParser } from '../../common/promptSyntax/parsers/basePromptParser.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

/**
 * Common instructions attachment variable identifier.
 */
type TInstructionsId = 'vscode.prompt.instructions';

/**
 * Instructions attachment variable identifier for
 * the `root` reference.
 */
type TInstructionsRootId = `${TInstructionsId}.root`;

/**
 * Well-defined instructions attachment variable identifiers.
 */
type TInstructionsVariableIds = TInstructionsId | TInstructionsRootId;

/**
 * Utility to convert a reference `URI` to a chat variable
 * entry with the specified variable {@linkcode id}.
 */
const toChatVariable = (id: TInstructionsVariableIds, uri: URI): IChatRequestVariableEntry => {
	return {
		id: `${id}__${uri}`,
		name: uri.fsPath,
		value: uri,
		isSelection: false,
		enabled: true,
		isFile: true,
		isDynamic: true,
		isMarkedReadonly: true,
	};
};

/**
 * Model for a collection of prompt instruction attachments.
 * See {@linkcode ChatInstructionsAttachmentModel} for individual attachment.
 */
export class ChatInstructionAttachmentsModel extends Disposable {
	/**
	 * Helper to locate prompt instruction files on the disk.
	 */
	private readonly instructionsFileReader: ChatInstructionsFileLocator;

	/**
	 * List of all prompt instruction attachments.
	 */
	private attachments: DisposableMap<string, ChatInstructionsAttachmentModel> =
		this._register(new DisposableMap());

	/**
	 * Get all `URI`s of all valid references, including all
	 * the possible references nested inside the children.
	 */
	public get references(): readonly URI[] {
		const result = [];

		for (const child of this.attachments.values()) {
			result.push(...child.references);
		}

		return result;
	}

	/**
	 * Get the list of all prompt instruction attachment variables, including all
	 * nested child references of each attachment explicitly attached by user.
	 */
	public get chatAttachments(): readonly IChatRequestVariableEntry[] {
		const result = [];
		const attachments = [...this.attachments.values()];

		for (const attachment of attachments) {
			const { reference } = attachment;

			// the usual URIs list of prompt instructions is `bottom-up`, therefore
			// we do the same herfe - first add all child references of the model
			result.push(
				...reference.allValidReferencesUris.map((uri) => {
					return toChatVariable('vscode.prompt.instructions', uri);
				}),
			);

			// then add the root reference of the model itself
			result.push(
				toChatVariable('vscode.prompt.instructions.root', reference.uri),
			);
		}

		return result;
	}

	/**
	 * Promise that resolves when parsing of all attached prompt instruction
	 * files completes, including parsing of all its possible child references.
	 */
	public async allSettled(): Promise<void> {
		const attachments = [...this.attachments.values()];

		await Promise.allSettled(
			attachments.map((attachment) => {
				return attachment.allSettled;
			}),
		);
	}

	/**
	 * Event that fires then this model is updated.
	 *
	 * See {@linkcode onUpdate}.
	 */
	protected _onUpdate = this._register(new Emitter<void>());
	/**
	 * Subscribe to the `onUpdate` event.
	 * @param callback Function to invoke on update.
	 */
	public onUpdate(callback: () => unknown): this {
		this._register(this._onUpdate.event(callback));

		return this;
	}

	/**
	 * Event that fires when a new prompt instruction attachment is added.
	 * See {@linkcode onAdd}.
	 */
	protected _onAdd = this._register(new Emitter<ChatInstructionsAttachmentModel>());
	/**
	 * The `onAdd` event fires when a new prompt instruction attachment is added.
	 *
	 * @param callback Function to invoke on add.
	 */
	public onAdd(callback: (attachment: ChatInstructionsAttachmentModel) => unknown): this {
		this._register(this._onAdd.event(callback));

		return this;
	}

	constructor(
		@IInstantiationService private readonly initService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		super();

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);
		this.instructionsFileReader = initService.createInstance(ChatInstructionsFileLocator);
	}

	/**
	 * Add a prompt instruction attachment instance with the provided `URI`.
	 * @param uri URI of the prompt instruction attachment to add.
	 */
	public add(uri: URI): this {
		// if already exists, nothing to do
		if (this.attachments.has(uri.path)) {
			return this;
		}

		const instruction = this.initService.createInstance(ChatInstructionsAttachmentModel, uri)
			.onUpdate(this._onUpdate.fire)
			.onDispose(() => {
				// note! we have to use `deleteAndLeak` here, because the `*AndDispose`
				//       alternative results in an infinite loop of calling this callback
				this.attachments.deleteAndLeak(uri.path);
				this._onUpdate.fire();
			});

		this.attachments.set(uri.path, instruction);
		instruction.resolve();

		this._onAdd.fire(instruction);
		this._onUpdate.fire();

		return this;
	}

	/**
	 * Remove a prompt instruction attachment instance by provided `URI`.
	 * @param uri URI of the prompt instruction attachment to remove.
	 */
	public remove(uri: URI): this {
		// if does not exist, nothing to do
		if (!this.attachments.has(uri.path)) {
			return this;
		}

		this.attachments.deleteAndDispose(uri.path);

		return this;
	}

	/**
	 * List prompt instruction files available and not attached yet.
	 */
	public async listNonAttachedFiles(): Promise<readonly URI[]> {
		return await this.instructionsFileReader.listFiles(this.references);
	}

	/**
	 * Checks if the prompt instructions feature is enabled in the user settings.
	 */
	public get featureEnabled(): boolean {
		return BasePromptParser.promptSnippetsEnabled(this.configService);
	}
}
