/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LaTeX Engine Service - Runs in webview context
 * Manages SwiftLaTeX engine for LaTeX compilation
 */

interface PdfTeXEngine {
	loadEngine(): Promise<void>;
	writeMemFSFile(filename: string, content: string | Uint8Array): void;
	setEngineMainFile(filename: string): void;
	compileLaTeX(): Promise<{
		pdf: Uint8Array;
		log: string;
		status: number;
	}>;
	setTexliveEndpoint(url: string): void;
	flushCache(): void;
	isReady(): boolean;
}

type PdfTeXEngineConstructor = new () => PdfTeXEngine;

export class LatexEngineService {
	private engine: PdfTeXEngine | null = null;
	private engineReady: boolean = false;
	private initializationPromise: Promise<void> | null = null;

	constructor(private Engine: PdfTeXEngineConstructor) {
		// Engine will be initialized on first use
	}

	/**
	 * Initialize the SwiftLaTeX engine
	 */
	public async initialize(): Promise<void> {
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		this.initializationPromise = (async () => {
			try {
				if (!this.engine) {
					this.engine = new this.Engine();
					await this.engine.loadEngine();
					this.engine.setTexliveEndpoint('https://texlive.emaily.re');
					this.engineReady = this.engine.isReady();
				}
			} catch (error) {
				// Error will be handled by caller
				throw error;
			}
		})();

		return this.initializationPromise;
	}

	/**
	 * Compile LaTeX source to PDF
	 */
	public async compile(latexSource: string, mainFile: string = 'main.tex'): Promise<{
		success: boolean;
		pdf?: Uint8Array;
		log?: string;
		error?: string;
	}> {
		try {
			// Ensure engine is initialized
			if (!this.engineReady) {
				await this.initialize();
			}

			if (!this.engine || !this.engine.isReady()) {
				return {
					success: false,
					error: 'SwiftLaTeX engine is not ready'
				};
			}

			// Write LaTeX source to virtual file system
			this.engine.writeMemFSFile(mainFile, latexSource);
			this.engine.setEngineMainFile(mainFile);

			// Compile LaTeX
			const result = await this.engine.compileLaTeX();

			if (result.status === 0 && result.pdf) {
				return {
					success: true,
					pdf: result.pdf,
					log: result.log
				};
			} else {
				return {
					success: false,
					error: `Compilation failed with status ${result.status}`,
					log: result.log
				};
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: message
			};
		}
	}

	/**
	 * Check if engine is ready
	 */
	public isReady(): boolean {
		return this.engineReady && this.engine !== null && this.engine.isReady();
	}

	/**
	 * Dispose resources
	 */
	public dispose(): void {
		if (this.engine) {
			this.engine.flushCache();
			this.engine = null;
		}
		this.engineReady = false;
		this.initializationPromise = null;
	}
}

