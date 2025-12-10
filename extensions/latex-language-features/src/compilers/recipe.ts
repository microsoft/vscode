/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LaTeX compilation recipes
 * Based on LaTeX-Workshop patterns
 */

export interface RecipeStep {
	name: string;
	command: string;
	args: string[];
}

export interface Recipe {
	name: string;
	steps: RecipeStep[];
}

/**
 * Recipe definitions similar to LaTeX-Workshop
 */
export class RecipeManager {
	private static readonly recipes: Map<string, Recipe> = new Map([
		[
			'pdflatex',
			{
				name: 'pdflatex',
				steps: [
					{
						name: 'pdflatex',
						command: 'pdflatex',
						args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '%DOC%']
					}
				]
			}
		],
		[
			'xelatex',
			{
				name: 'xelatex',
				steps: [
					{
						name: 'xelatex',
						command: 'xelatex',
						args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '%DOC%']
					}
				]
			}
		],
		[
			'lualatex',
			{
				name: 'lualatex',
				steps: [
					{
						name: 'lualatex',
						command: 'lualatex',
						args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '%DOC%']
					}
				]
			}
		],
		[
			'latexmk',
			{
				name: 'latexmk',
				steps: [
					{
						name: 'pdflatex',
						command: 'pdflatex',
						args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '%DOC%']
					},
					{
						name: 'bibtex',
						command: 'bibtex',
						args: ['%DOCFILE%']
					},
					{
						name: 'pdflatex',
						command: 'pdflatex',
						args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '%DOC%']
					},
					{
						name: 'pdflatex',
						command: 'pdflatex',
						args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '%DOC%']
					}
				]
			}
		]
	]);

	/**
	 * Get a recipe by name
	 */
	static getRecipe(name: string): Recipe | undefined {
		return this.recipes.get(name);
	}

	/**
	 * Get all available recipe names
	 */
	static getRecipeNames(): string[] {
		return Array.from(this.recipes.keys());
	}

	/**
	 * Check if a recipe is supported by WASM compiler
	 * WASM compiler (SwiftLaTeX) primarily supports pdflatex
	 */
	static isWasmSupported(recipeName: string): boolean {
		// WASM compiler supports basic pdflatex compilation
		// Complex recipes like latexmk with bibtex require server compiler
		return recipeName === 'pdflatex';
	}

	/**
	 * Expand recipe placeholders
	 * %DOC% -> full document path without extension
	 * %DOCFILE% -> document filename without extension
	 */
	static expandRecipeArgs(args: string[], docPath: string, docFile: string): string[] {
		return args.map(arg => {
			return arg
				.replace(/%DOC%/g, docPath)
				.replace(/%DOCFILE%/g, docFile);
		});
	}
}

