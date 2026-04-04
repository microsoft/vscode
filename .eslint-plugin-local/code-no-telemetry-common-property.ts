/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';

const telemetryMethods = new Set(['publicLog', 'publicLog2', 'publicLogError', 'publicLogError2']);

/**
 * Common telemetry property names that are automatically added to every event.
 * Telemetry events must not set these because they would collide with / be
 * overwritten by the common properties that the telemetry pipeline injects.
 *
 * Collected from:
 *   - src/vs/platform/telemetry/common/commonProperties.ts  (resolveCommonProperties)
 *   - src/vs/workbench/services/telemetry/common/workbenchCommonProperties.ts
 *   - src/vs/workbench/services/telemetry/browser/workbenchCommonProperties.ts
 */
const commonTelemetryProperties = new Set([
	'common.machineid',
	'common.sqmid',
	'common.devdeviceid',
	'sessionid',
	'commithash',
	'version',
	'common.releasedate',
	'common.platformversion',
	'common.platform',
	'common.nodeplatform',
	'common.nodearch',
	'common.product',
	'common.msftinternal',
	'timestamp',
	'common.timesincesessionstart',
	'common.sequence',
	'common.snap',
	'common.platformdetail',
	'common.version.shell',
	'common.version.renderer',
	'common.firstsessiondate',
	'common.lastsessiondate',
	'common.isnewsession',
	'common.remoteauthority',
	'common.cli',
	'common.useragent',
	'common.istouchdevice',
	'common.copilottrackingid',
]);

export default new class NoTelemetryCommonProperty implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noCommonProperty: 'Telemetry events must not contain the common property "{{name}}". Common properties are automatically added by the telemetry pipeline and will be dropped.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		/**
		 * Check whether any property key in an object expression is a reserved common telemetry property.
		 */
		function checkObjectForCommonProperties(node: ESTree.ObjectExpression) {
			for (const prop of node.properties) {
				if (prop.type === 'Property') {
					let name: string | undefined;
					if (prop.key.type === 'Identifier') {
						name = prop.key.name;
					} else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
						name = prop.key.value;
					}
					if (name && commonTelemetryProperties.has(name.toLowerCase())) {
						context.report({
							node: prop.key,
							messageId: 'noCommonProperty',
							data: { name },
						});
					}
				}
			}
		}

		return {
			['CallExpression[callee.property.type="Identifier"]'](node: ESTree.CallExpression) {
				const callee = node.callee;
				if (callee.type !== 'MemberExpression') {
					return;
				}
				const prop = callee.property;
				if (prop.type !== 'Identifier' || !telemetryMethods.has(prop.name)) {
					return;
				}
				// The data argument is the second argument for publicLog/publicLog2/publicLogError/publicLogError2
				const dataArg = node.arguments[1];
				if (dataArg && dataArg.type === 'ObjectExpression') {
					checkObjectForCommonProperties(dataArg);
				}
			},
		};
	}
};
