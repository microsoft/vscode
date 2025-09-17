/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { CellNode } from '../../../../services/erdosAiIntegration/browser/jupytext/types.js';
import { MonacoWidgetEditor } from './MonacoWidgetEditor.js';
import { IMonacoWidgetServices } from '../widgets/widgetTypes.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommonUtils } from '../../../../services/erdosAiUtils/common/commonUtils.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';

interface NotebookCellRendererProps {
	cells: CellNode[];
	monacoServices: IMonacoWidgetServices;
	configurationService: IConfigurationService;
	commonUtils: ICommonUtils;
	isReadOnly: boolean;
	functionType: 'search_replace' | 'run_console_cmd' | 'run_terminal_cmd' | 'delete_file' | 'run_file';
	filename?: string;
	diffData?: {
		diff_data: Array<{
			type: 'added' | 'deleted' | 'unchanged';
			content: string;
			old_line?: number;
			new_line?: number;
		}>;
		added?: number;
		deleted?: number;
		clean_filename?: string;
	};
}

export const NotebookCellRenderer: React.FC<NotebookCellRendererProps> = ({ 
	cells, 
	monacoServices, 
	configurationService,
	commonUtils,
	isReadOnly, 
	functionType, 
	filename,
	diffData 
}) => {
	if (!cells || cells.length === 0) {
		return <div className="notebookOverlay">No notebook cells found</div>;
	}
	
	return (
		<div className="notebookOverlay" style={{ width: '100%' }}>
			{cells.map((cell, index) => {
				// For diff display, construct content from diffLines to ensure perfect sync
				let cellContent;
				if ((cell as any).diffLines && (cell as any).diffLines.length > 0) {
					// Use diffLines content in exact order for diff display
					cellContent = (cell as any).diffLines.map((diffLine: any) => diffLine.content).join('\n');
				} else {
					// Fallback to regular cell source for non-diff display
					cellContent = typeof cell.source === 'string' ? cell.source : cell.source.join('');
				}
				
				if (cell.cell_type === 'code') {
					return (
						<div key={index} className="code-cell-row" style={{ width: '100%' }}>
							<div className="cell-inner-container" style={{ width: '100%', paddingTop: '6px', paddingBottom: '6px' }}>
								<div className="cell-focus-indicator cell-focus-indicator-top"></div>
								<div className="cell-focus-indicator cell-focus-indicator-side cell-focus-indicator-left">
									<div className="execution-count-label"></div>
								</div>
								<div className="cell code" style={{ width: '100%' }}>
									<div className="cell-editor-part" style={{ width: '100%' }}>
										<div className="cell-editor-container" style={{ width: '100%' }}>
											<MonacoWidgetEditor 
												content={cellContent}
												language="python"
												isReadOnly={isReadOnly}
												functionType={functionType}
												filename={filename}
												monacoServices={monacoServices}
												configurationService={configurationService}
												commonUtils={commonUtils}
												diffLines={(cell as any).diffLines}
											/>
										</div>
									</div>
								</div>
								<div className="cell-focus-indicator cell-focus-indicator-side cell-focus-indicator-right"></div>
								<div className="cell-focus-indicator cell-focus-indicator-bottom"></div>
							</div>
						</div>
					);
				} else if (cell.cell_type === 'markdown') {
					return (
						<div key={index} className="markdown-cell-row" style={{ width: '100%' }}>
							<div className="cell-inner-container" style={{ width: '100%', paddingTop: '8px', paddingBottom: '8px' }}>
								<div className="cell-focus-indicator cell-focus-indicator-top"></div>
								<div className="cell-focus-indicator cell-focus-indicator-side cell-focus-indicator-left"></div>
								<div className="cell markdown" style={{ width: '100%' }}>
									<VSCodeMarkdownRenderer content={cellContent} />
								</div>
								<div className="cell-focus-indicator cell-focus-indicator-side cell-focus-indicator-right"></div>
								<div className="cell-focus-indicator cell-focus-indicator-bottom"></div>
							</div>
						</div>
					);
				} else {
					// Raw cell
					return (
						<div key={index} className="code-cell-row" style={{ width: '100%' }}>
							<div className="cell-inner-container" style={{ width: '100%' }}>
								<div className="cell-focus-indicator cell-focus-indicator-top"></div>
								<div className="cell-focus-indicator cell-focus-indicator-side cell-focus-indicator-left"></div>
								<div className="cell code" style={{ width: '100%' }}>
									<pre style={{ margin: 0, whiteSpace: 'pre-wrap', width: '100%' }}>{cellContent}</pre>
								</div>
								<div className="cell-focus-indicator cell-focus-indicator-side cell-focus-indicator-right"></div>
								<div className="cell-focus-indicator cell-focus-indicator-bottom"></div>
							</div>
						</div>
					);
				}
			})}
		</div>
	);
};

// Use VS Code's actual markdown renderer
const VSCodeMarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const disposablesRef = React.useRef<DisposableStore>(new DisposableStore());

	React.useEffect(() => {
		if (containerRef.current && content) {
			const disposables = disposablesRef.current;
			disposables.clear();

			// Use VS Code's renderMarkdown function
			const rendered = disposables.add(renderMarkdown({ 
				value: content, 
				supportThemeIcons: true,
				supportHtml: true
			}));

			// Clear container and append rendered element
			containerRef.current.innerHTML = '';
			containerRef.current.appendChild(rendered.element);
		}

		return () => {
			disposablesRef.current.clear();
		};
	}, [content]);

	React.useEffect(() => {
		return () => {
			disposablesRef.current.dispose();
		};
	}, []);

	return <div ref={containerRef} className="notebook-markdown-content" />;
};
