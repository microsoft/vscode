/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The extension ID used by Erdos runtime notebook kernels.
 *
 * Although runtime notebook kernels live in the main thread, some notebook services still expect it
 * to have an extension ID.
 */
export const ERDOS_RUNTIME_NOTEBOOK_KERNELS_EXTENSION_ID = 'erdos.runtime-notebook-kernels';

