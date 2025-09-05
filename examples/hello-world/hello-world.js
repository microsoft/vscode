/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hello World example for VS Code Copilot Instructions
 * 
 * This file demonstrates basic JavaScript functionality and shows how
 * the copilot instructions system can provide context to AI assistants.
 */

/**
 * Prints a hello world message to the console
 */
function helloWorld() {
	console.log('Hello World!');
}

/**
 * Prints a greeting with a custom name
 * @param {string} name - The name to greet
 */
function greetUser(name) {
	console.log(`Hello, ${name}!`);
}

/**
 * Demonstrates the hello world functionality
 */
function main() {
	// Basic hello world
	helloWorld();
	
	// Personalized greeting
	greetUser('VS Code Copilot');
	
	// Show that copilot instructions are working
	console.log('This example demonstrates VS Code Copilot instructions functionality.');
}

// Run the example
main();