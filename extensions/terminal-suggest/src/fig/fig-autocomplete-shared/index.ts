/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Internal from './convert';
import type * as Metadata from './specMetadata';
import { revertSubcommand } from './revert';
import { convertSubcommand } from './convert';
import { convertLoadSpec, initializeDefault } from './specMetadata';
import { SpecMixin, applyMixin, mergeSubcommands } from './mixins';
import { SpecLocationSource, makeArray } from './utils';

export {
	Internal,
	revertSubcommand,
	convertSubcommand,
	Metadata,
	convertLoadSpec,
	initializeDefault,
	SpecMixin,
	applyMixin,
	mergeSubcommands,
	makeArray,
	SpecLocationSource,
};
