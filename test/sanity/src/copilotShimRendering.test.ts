/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import { test } from 'mocha';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertCopilotLinkHelperSource, assertEmbeddedCopilotLinkHelper } from './copilotShimRendering.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const helperPath = path.join(repositoryRoot, 'resources/linux/copilot-link.sh');
const helperSource = fs.readFileSync(helperPath, 'utf8');

test('Copilot link helper has literal targets and no rendering placeholders', () => {
	assertCopilotLinkHelperSource(helperSource, helperPath);
});

test('Embedded Copilot helper permits placeholders in disabled shell comments', () => {
	const script = `${helperSource}
#if [ "code-oss" != "code-oss" ]; then
	# echo "baseurl=@@UPDATEURL@@/api/rpm/@@QUALITY@@/x64/rpm"
#fi
vscode_copilot_link install "code-oss" || :
`;
	assert.doesNotThrow(() => assertEmbeddedCopilotLinkHelper(script, helperSource, 'OSS RPM'));
});

test('Embedded Copilot helper rejects placeholders in executable lines', () => {
	for (const line of [
		'echo "@@UPDATEURL@@/api/rpm/@@QUALITY@@/x64/rpm"',
		'printf "%s\\n" "#@@QUALITY@@"',
		'vscode_copilot_link install "@@NAME@@" || :',
	]) {
		assert.throws(
			() => assertEmbeddedCopilotLinkHelper(`${helperSource}\n${line}`, helperSource, 'RPM'),
			/contains an unresolved template marker/u,
		);
	}
});

test('Embedded Copilot helper rejects its insertion marker even in comments', () => {
	assert.throws(
		() => assertEmbeddedCopilotLinkHelper(`${helperSource}\n# @@COPILOT_LINK_HELPER@@`, helperSource, 'RPM'),
		/retains @@COPILOT_LINK_HELPER@@/u,
	);
});

test('Embedded Copilot helper must remain exact when comments contain placeholders', () => {
	const alteredHelper = helperSource.replace('/usr/bin/copilot', '/tmp/copilot');
	assert.throws(
		() => assertEmbeddedCopilotLinkHelper(`${alteredHelper}\n# @@QUALITY@@`, helperSource, 'RPM'),
		/does not embed the exact Copilot link helper source/u,
	);
});

test('Copilot link templates use callback rendering and preserve RPM percent escaping', () => {
	const postinst = fs.readFileSync(path.join(repositoryRoot, 'resources/linux/debian/postinst.template'), 'utf8');
	const postrm = fs.readFileSync(path.join(repositoryRoot, 'resources/linux/debian/postrm.template'), 'utf8');
	const rpmSpec = fs.readFileSync(path.join(repositoryRoot, 'resources/linux/rpm/code.spec.template'), 'utf8');
	const gulpfile = fs.readFileSync(path.join(repositoryRoot, 'build/gulpfile.vscode.linux.ts'), 'utf8');

	for (const [name, template, expectedMarkers] of [
		['DEB postinst', postinst, 1],
		['DEB postrm', postrm, 1],
		['RPM spec', rpmSpec, 2],
	] as const) {
		assert.strictEqual((template.match(/@@COPILOT_LINK_HELPER@@/gu) ?? []).length, expectedMarkers, `${name} must embed the helper once per lifecycle script.`);
	}

	assert.match(gulpfile, /const rpmCopilotLinkHelper = copilotLinkHelper\.replace\(\/%\/g, '%%'\);/u);
	assert.strictEqual((gulpfile.match(/replace\('@@COPILOT_LINK_HELPER@@', \(\) => copilotLinkHelper\)/gu) ?? []).length, 2, 'DEB templates must use callback replacement for the helper.');
	assert.strictEqual((gulpfile.match(/replace\('@@COPILOT_LINK_HELPER@@', \(\) => rpmCopilotLinkHelper\)/gu) ?? []).length, 1, 'RPM template must use the percent-escaped helper.');
});
