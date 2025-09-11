/**
 * NBFormat data structures for Jupyter notebooks
 * Replaces Python's nbformat library with TypeScript interfaces
 */

export interface NotebookNode {
  nbformat: number;
  nbformat_minor: number;
  metadata: Record<string, any>;
  cells: CellNode[];
}

export interface CellNode {
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  metadata: Record<string, any>;
  outputs?: any[];
  execution_count?: number | null;
  id?: string;
  attachments?: Record<string, any>;
}

export function newCodeCell(source: string = '', metadata: Record<string, any> = {}): CellNode {
  return {
    cell_type: 'code',
    source,
    metadata,
    outputs: [],
    execution_count: null
  };
}

export function newMarkdownCell(source: string = '', metadata: Record<string, any> = {}): CellNode {
  return {
    cell_type: 'markdown',
    source,
    metadata
  };
}

export function newRawCell(source: string = '', metadata: Record<string, any> = {}): CellNode {
  return {
    cell_type: 'raw',
    source,
    metadata
  };
}

export function newNotebook(cells: CellNode[] = [], metadata: Record<string, any> = {}): NotebookNode {
  return {
    nbformat: 4,
    nbformat_minor: 2,
    metadata,
    cells
  };
}
