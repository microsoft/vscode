import * as vscode from 'vscode';

const ignoredExtensions = [
  '.git',
  '.vscode',
  '.vscode-test',
  '.github',
  '.vscodeignore',
];

export function clipStringToLimits(value: string) {
  const config = vscode.workspace.getConfiguration('datacurveTracer');
  const limits = {
    min: config.get<number>('minStringSize') ?? 0,
    max: config.get<number>('maxStringSize') ?? 1024 * 1024, // 1MB
  };
  if (value.length < limits.min) {
    return value.padEnd(limits.min);
  }
  if (value.length > limits.max) {
    return value.substring(0, limits.max);
  }
  return value;
}

export function clipRangeToLimits(range: vscode.Range, maxChars: number) {
  // Only handle single-line ranges for simplicity
  if (range.start.line !== range.end.line) {
    return range;
  }

  const currentLength = range.end.character - range.start.character;

  // If already within limits, return as is
  if (currentLength <= maxChars) {
    return range;
  }

  // Clip from beginning by adjusting the start position
  const newStartChar = range.end.character - maxChars;
  const newStart = new vscode.Position(
    range.start.line,
    Math.max(0, newStartChar),
  );

  return new vscode.Range(newStart, range.end);
}
