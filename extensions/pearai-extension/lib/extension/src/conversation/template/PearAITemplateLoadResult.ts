import * as vscode from "vscode";
import { PearAITemplate } from "./PearAITemplate";

export type PearAITemplateLoadResult =
	| {
			type: "success";
			file: vscode.Uri;
			template: PearAITemplate;
	  }
	| {
			type: "error";
			file: vscode.Uri;
			error: unknown;
	  };
