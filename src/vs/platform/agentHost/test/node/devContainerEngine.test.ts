/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toWslcCommand } from '../../node/devContainerEngine.js';

suite('Dev Container engines', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function run(args: readonly string[], stdout: string, code = 0) {
		const command = toWslcCommand(args);
		return { args: command.args, ...command.transformResult({ stdout, stderr: '', code }) };
	}

	test('evaluates the Go templates of Docker commands on WSLc\'s JSON output', () => {
		const container = JSON.stringify([{
			Mounts: [{ Type: 'bind', Source: 'C:\\project', Destination: '/workspaces/project', Name: '' }],
			Config: { Image: 'ubuntu', Labels: { 'devcontainer.metadata': '[{"remoteUser":"vscode"}]' } },
		}]);
		assert.deepStrictEqual({
			mounts: run(['inspect', '--format', '{{json .Mounts}}', 'id'], container),
			metadata: run(['inspect', '--format', '{{index .Config.Labels "devcontainer.metadata"}}', 'id'], container),
			missingLabel: run(['inspect', '--format', '{{index .Config.Labels "missing"}}', 'id'], container).stdout,
			image: run(['inspect', '--format', '{{json .Config.Image}}', 'id'], container).stdout,
			states: run(['ps', '-a', '--format', '{{.State}}', '--filter', 'label=a=b'], '{"ID":"1","State":"running"}\r\n{"ID":"2","State":"exited"}\r\n'),
			noVolumes: run(['volume', 'ls', '--format', '{{.Name}}'], '').stdout,
			volumeLabels: run(['volume', 'inspect', '--format', '{{json .Labels}}', 'volume'], '[\n  {\n    "Labels": {\n      "a": "1"\n    },\n    "Name": "volume"\n  }\n]\n').stdout,
		}, {
			mounts: { args: ['inspect', '--format', 'json', 'id'], stdout: '[{"Type":"bind","Source":"C:\\\\project","Destination":"/workspaces/project","Name":""}]\n', stderr: '', code: 0 },
			metadata: { args: ['inspect', '--format', 'json', 'id'], stdout: '[{"remoteUser":"vscode"}]\n', stderr: '', code: 0 },
			missingLabel: '<no value>\n',
			image: '"ubuntu"\n',
			states: { args: ['ps', '-a', '--format', 'json', '--filter', 'label=a=b'], stdout: 'running\nexited\n', stderr: '', code: 0 },
			noVolumes: '',
			volumeLabels: '{"a":"1"}\n',
		});
	});

	test('keeps other commands, failures, and output it cannot read apart', () => {
		const failed = { stdout: '', stderr: 'Object not found: id', code: 1 };
		assert.deepStrictEqual({
			exec: toWslcCommand(['exec', 'id', 'docker', 'ps', '--format', '{{.State}}']).args,
			remove: toWslcCommand(['rm', '--force', 'id']).args,
			unknownTemplate: toWslcCommand(['ps', '--format', '{{range .Mounts}}{{.Name}}{{end}}']).args,
			failed: toWslcCommand(['inspect', '--format', '{{json .}}', 'id']).transformResult(failed),
			unreadable: run(['inspect', '--format', '{{json .}}', 'id'], 'not json').code,
		}, {
			exec: ['exec', 'id', 'docker', 'ps', '--format', '{{.State}}'],
			remove: ['rm', '--force', 'id'],
			unknownTemplate: ['ps', '--format', '{{range .Mounts}}{{.Name}}{{end}}'],
			failed,
			unreadable: 1,
		});
	});
});
