/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Kernel specification and runtime metadata types for the Erdos Kernel Bridge
 */

export interface JupyterKernelSpec {
  argv: string[];
  display_name: string;
  language: string;
  interrupt_mode?: 'signal' | 'message';
  env?: Record<string, string>;
  kernel_protocol_version: string;
}

export interface RuntimeMetadata {
  runtimeId: string;
  runtimeName: string;
  languageName: string;
  languageVersion: string;
  runtimePath: string;
  extraRuntimeData?: any;
}




