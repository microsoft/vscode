import * as vscode from "vscode";

/** Log levels in increasing order of importance */
const logLevels = ["debug", "info", "warning", "error"] as const;
type LogLevel = (typeof logLevels)[number];

export function getVSCodeLogLevel(): LogLevel {
	const setting: string = vscode.workspace
		.getConfiguration("pearai.logger")
		.get("level", "");

	return logLevels.find((l) => setting == l) ?? "info";
}

export interface Logger {
	setLevel(level: LogLevel): void;
	debug(message: string | string[]): void;
	log(message: string | string[]): void;
	warn(message: string | string[]): void;
	error(message: string | string[]): void;
}

export class LoggerUsingVSCodeOutput implements Logger {
	private level: LogLevel;
	private readonly outputChannel: vscode.OutputChannel;

	constructor({
		level,
		outputChannel,
	}: {
		level: LogLevel;
		outputChannel: vscode.OutputChannel;
	}) {
		this.level = level;
		this.outputChannel = outputChannel;
	}

	setLevel(level: LogLevel) {
		this.level = level;
	}

	debug(message: string | string[]): void {
		return this.write({
			lines: ([] as string[]).concat(message),
			prefix: "[DEBUG]",
			level: "debug",
		});
	}

	log(message: string | string[]): void {
		return this.write({
			lines: ([] as string[]).concat(message),
			prefix: "[INFO]",
			level: "info",
		});
	}

	warn(message: string | string[]): void {
		return this.write({
			lines: ([] as string[]).concat(message),
			prefix: "[WARNING]",
			level: "warning",
		});
	}

	error(message: string | string[]): void {
		return this.write({
			lines: ([] as string[]).concat(message),
			prefix: "[ERROR]",
			level: "error",
		});
	}

	private write(options: {
		lines: string[];
		prefix: string;
		level: LogLevel;
	}): void {
		const { lines, prefix, level } = options;
		if (!this.canLog(level)) return;

		lines.forEach((line) => {
			this.outputChannel.appendLine(`${prefix} ${line}`);
		});
	}

	private canLog(level: LogLevel): boolean {
		const requestedLevel = logLevels.findIndex((l) => l == level);
		const minLevel = logLevels.findIndex((l) => l == this.level);
		return requestedLevel >= minLevel;
	}
}
