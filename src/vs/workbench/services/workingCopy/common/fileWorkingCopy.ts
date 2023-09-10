/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import { VSBufferReadableStream } from 'vs/base/common/buffer';
import { URI } from 'vs/base/common/uri';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';

export interface IFileWorkingCopyModelFactory<M extends IFileWorkingCopyModel> {

	/**
	 * Create a model for the untitled or stored working copy
	 * from the given content under the provided resource.
	 *
	 * @param resource the `URI` of the model
	 * @param contents the content of the model to create it
	 * @param token support for cancellation
	 */
	createModel(resource: URI, contents: VSBufferReadableStream, token: CancellationToken): Promise<M>;
}

export interface IFileWorkingCopyModelConfiguration {

	/**
	 * The delay in milliseconds to wait before triggering
	 * a backup after the content of the model has changed.
	 *
	 * If not configured, a sensible default will be taken
	 * based on user settings.
	 */
	readonly backupDelay?: number;
}

/**
 * A generic file working copy model to be reused by untitled
 * and stored file working copies.
 */
export interface IFileWorkingCopyModel extends IDisposable {

	/**
	 * This event signals ANY changes to the contents, for example:
	 * - through the user typing into the editor
	 * - from API usage (e.g. bulk edits)
	 * - when `IFileWorkingCopyModel#update` is invoked with contents
	 *   that are different from the current contents
	 *
	 * The file working copy will listen to these changes and may mark
	 * the working copy as dirty whenever this event fires.
	 *
	 * Note: ONLY report changes to the model but not the underlying
	 * file. The file working copy is tracking changes to the file
	 * automatically.
	 */
	readonly onDidChangeContent: Event<unknown>;

	/**
	 * An event emitted right before disposing the model.
	 */
	readonly onWillDispose: Event<void>;

	/**
	 * Optional additional configuration for the model that drives
	 * some of the working copy behaviour.
	 */
	readonly configuration?: IFileWorkingCopyModelConfiguration;

	/**
	 * Snapshots the model's current content for writing. This must include
	 * any changes that were made to the model that are in memory.
	 *
	 * @param token support for cancellation
	 */
	snapshot(token: CancellationToken): Promise<VSBufferReadableStream>;

	/**
	 * Updates the model with the provided contents. The implementation should
	 * behave in a similar fashion as `IFileWorkingCopyModelFactory#createModel`
	 * except that here the model already exists and just needs to update to
	 * the provided contents.
	 *
	 * Note: it is expected that the model fires a `onDidChangeContent` event
	 * as part of the update.
	 *
	 * @param contents the contents to use for the model
	 * @param token support for cancellation
	 */
	update(contents: VSBufferReadableStream, token: CancellationToken): Promise<void>;
}

export interface IFileWorkingCopy<M extends IFileWorkingCopyModel> extends IWorkingCopy, IDisposable {

	/**
	 * An event for when the file working copy has been reverted.
	 */
	readonly onDidRevert: Event<void>;

	/**
	 * An event for when the file working copy has been disposed.
	 */
	readonly onWillDispose: Event<void>;

	/**
	 * Provides access to the underlying model of this file
	 * based working copy. As long as the file working copy
	 * has not been resolved, the model is `undefined`.
	 */
	readonly model: M | undefined;

	/**
	 * Resolves the file working copy and thus makes the `model`
	 * available.
	 */
	resolve(): Promise<void>;

	/**
	 * Whether we have a resolved model or not.
	 */
	isResolved(): this is IResolvedFileWorkingCopy<M>;
}

export interface IResolvedFileWorkingCopy<M extends IFileWorkingCopyModel> extends IFileWorkingCopy<M> {

	/**
	 * A resolved file working copy has a resolved model.
	 */
	readonly model: M;
}
