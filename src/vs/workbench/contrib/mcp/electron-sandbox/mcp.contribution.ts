/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { mcpDiscoveryRegistry } from '../common/discovery/mcpDiscovery.js';
import { NativeMcpDiscovery } from './nativeMpcDiscovery.js';

mcpDiscoveryRegistry.register(new SyncDescriptor(NativeMcpDiscovery));
