// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { SpecPipelineServer } from './server';
import { SpecPipelineConfig } from './types';

const config: SpecPipelineConfig = {
	server: {
		port: parseInt(process.env['SPEC_PIPELINE_PORT'] ?? '8090', 10),
	},
	specsDir: process.env['SPECS_DIR'] ?? '.son-of-anton/specs',
};

const server = new SpecPipelineServer(config);
server.start();

console.log('[spec-pipeline] Service started.');
