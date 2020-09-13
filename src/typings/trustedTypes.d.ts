/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// see https://w3c.github.io/webappsec-trusted-types/dist/spec/
// this isn't complete nor 100% correct

type TrustedHTML = string & object;
type TrustedScript = string;
type TrustedScriptURL = string;

interface TrustedTypePolicyOptions {
	createHTML?: (value: string) => string
	createScript?: (value: string) => string
	createScriptURL?: (value: string) => string
}

interface TrustedTypePolicy {
	readonly name: string;
	createHTML(input: string, ...more: any[]): TrustedHTML
	createScript(input: string, ...more: any[]): TrustedScript
	createScriptURL(input: string, ...more: any[]): TrustedScriptURL
}

interface TrustedTypePolicyFactory {
	createPolicy(policyName: string, object: TrustedTypePolicyOptions): TrustedTypePolicy;
}

interface Window {
	trustedTypes: TrustedTypePolicyFactory | undefined;
}

interface WorkerGlobalScope {
	trustedTypes: TrustedTypePolicyFactory | undefined;
}
