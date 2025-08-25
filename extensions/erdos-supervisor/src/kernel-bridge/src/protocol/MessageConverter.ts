/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Message Converter for the Erdos Kernel Bridge
 * Handles message conversion between Python IPyKernel and Ark R kernel protocols
 */

import { JupyterMessage } from '../types';

export type KernelType = 'python' | 'ark';

export interface ConversionContext {
  kernelType: KernelType;
  direction: 'to_kernel' | 'from_kernel';
  messageType: string;
  sessionId: string;
}

export interface ConversionResult {
  success: boolean;
  message: JupyterMessage;
  warnings: string[];
  errors: string[];
}

export interface MessageValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive message converter for handling differences between
 * Python IPyKernel and Ark R kernel message formats
 */
export class MessageConverter {
  // Note: These field sets are available for reference but not currently used in favor of explicit checks
  // private static readonly ARK_REQUIRED_FIELDS = new Set([
  //   'transient',     // Always present in Ark DisplayData
  //   'debugger',      // Always present in Ark KernelInfoReply
  //   'help_links',    // Always present in Ark KernelInfoReply
  //   'indent'         // Always present in Ark IsCompleteReply
  // ]);

  // private static readonly ARK_MISSING_FIELDS = new Set([
  //   'payload',       // Missing in Ark ExecuteReply
  //   'data'           // Missing in Ark CommClose
  // ]);

  private static readonly U32_FIELDS = new Set([
    'execution_count',
    'cursor_pos',
    'cursor_start',
    'cursor_end',
    'detail_level'
  ]);

  /**
   * Convert a message for the target kernel type
   */
  static convertMessageForKernel(
    message: JupyterMessage, 
    context: ConversionContext
  ): ConversionResult {
    const result: ConversionResult = {
      success: true,
      message: this.deepClone(message),
      warnings: [],
      errors: []
    };

    try {
      if (context.kernelType === 'ark') {
        this.convertForArkKernel(result, context);
      } else if (context.kernelType === 'python') {
        this.convertForPythonKernel(result, context);
      }

      // Apply universal conversions
      this.applyUniversalConversions(result, context);

      // Validate the final message
      const validation = this.validateMessage(result.message, context);
      result.warnings.push(...validation.warnings);
      if (!validation.isValid) {
        result.errors.push(...validation.errors);
        result.success = false;
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Conversion failed: ${error}`);
    }

    return result;
  }

  /**
   * Convert Ark u32 values to TypeScript numbers
   */
  static arkU32ToNumber(value: any): number {
    if (typeof value === 'number') {
      return Math.floor(Math.max(0, value));
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : Math.floor(Math.max(0, parsed));
    }
    if (value === null || value === undefined) {
      return 0;
    }
    return 0;
  }

  /**
   * Convert TypeScript numbers to values Ark expects
   */
  static numberToArkU32(value: number): number {
    return Math.floor(Math.max(0, value));
  }

  /**
   * Provide default values for fields missing in Ark
   */
  static addMissingFieldsForArk(message: JupyterMessage): JupyterMessage {
    const cloned = this.deepClone(message);
    const content = cloned.content;

    // Add missing payload field for execute_reply
    if (cloned.header.msg_type === 'execute_reply' && !('payload' in content)) {
      content.payload = [];
    }

    // Add missing data field for comm_close
    if (cloned.header.msg_type === 'comm_close' && !('data' in content)) {
      content.data = {};
    }

    // Ensure required fields are present for various message types
    switch (cloned.header.msg_type) {
      case 'display_data':
        if (!content.transient) {
          content.transient = {};
        }
        break;

      case 'kernel_info_reply':
        if (!content.debugger) {
          content.debugger = false;
        }
        if (!content.help_links) {
          content.help_links = [];
        }
        break;

      case 'is_complete_reply':
        if (!content.indent) {
          content.indent = '';
        }
        break;
    }

    return cloned;
  }

  /**
   * Handle optional fields for Python compatibility
   */
  static makeFieldsOptionalForPython(message: JupyterMessage): JupyterMessage {
    const cloned = this.deepClone(message);
    const content = cloned.content;

    // Remove empty transient field for display_data
    if (cloned.header.msg_type === 'display_data' && 
        content.transient && 
        typeof content.transient === 'object' &&
        Object.keys(content.transient).length === 0) {
      delete content.transient;
    }

    // Remove empty metadata if not required
    if (content.metadata && 
        typeof content.metadata === 'object' &&
        Object.keys(content.metadata).length === 0) {
      // Keep metadata for certain message types that require it
      const requiresMetadata = [
        'execute_result',
        'display_data',
        'complete_reply',
        'inspect_reply'
      ];
      if (!requiresMetadata.includes(cloned.header.msg_type)) {
        delete content.metadata;
      }
    }

    return cloned;
  }

  /**
   * Convert numeric fields for Ark kernel (u32 handling)
   */
  static convertNumericFields(message: JupyterMessage, toArk: boolean): JupyterMessage {
    const cloned = this.deepClone(message);
    const content = cloned.content;

    // Convert u32 fields
    this.U32_FIELDS.forEach(field => {
      if (content[field] !== undefined) {
        if (toArk) {
          content[field] = this.numberToArkU32(content[field]);
        } else {
          content[field] = this.arkU32ToNumber(content[field]);
        }
      }
    });

    return cloned;
  }

  /**
   * Validate message structure for kernel compatibility
   */
  static validateMessage(
    message: JupyterMessage, 
    context: ConversionContext
  ): MessageValidationResult {
    const result: MessageValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Validate header
    if (!message.header) {
      result.errors.push('Message missing required header');
      result.isValid = false;
      return result;
    }

    if (!message.header.msg_type) {
      result.errors.push('Message header missing msg_type');
      result.isValid = false;
    }

    if (!message.header.msg_id) {
      result.errors.push('Message header missing msg_id');
      result.isValid = false;
    }

    // Validate content based on message type and kernel
    this.validateMessageContent(message, context, result);

    return result;
  }

  /**
   * Normalize stream names for cross-kernel compatibility
   */
  static normalizeStreamNames(message: JupyterMessage): JupyterMessage {
    if (message.header.msg_type === 'stream') {
      const cloned = this.deepClone(message);
      const content = cloned.content;

      // Ensure stream name is lowercase and valid
      if (content.name) {
        const normalizedName = content.name.toString().toLowerCase();
        if (normalizedName === 'stdout' || normalizedName === 'stderr') {
          content.name = normalizedName;
        } else {
          // Default to stdout for unknown streams
          content.name = 'stdout';
        }
      } else {
        content.name = 'stdout';
      }
    }

    return message;
  }

  /**
   * Handle execution count consistency
   */
  static normalizeExecutionCount(message: JupyterMessage, kernelType: KernelType): JupyterMessage {
    const cloned = this.deepClone(message);
    const content = cloned.content;

    if ('execution_count' in content) {
      if (kernelType === 'ark') {
        content.execution_count = this.numberToArkU32(content.execution_count);
      } else {
        content.execution_count = this.arkU32ToNumber(content.execution_count);
      }

      // Ensure execution count is never negative
      if (content.execution_count < 0) {
        content.execution_count = 0;
      }
    }

    return cloned;
  }

  // Private helper methods
  private static convertForArkKernel(result: ConversionResult, context: ConversionContext): void {
    // Convert to Ark-compatible format
    result.message = this.addMissingFieldsForArk(result.message);
    result.message = this.convertNumericFields(result.message, true);
    result.message = this.normalizeStreamNames(result.message);
    result.message = this.normalizeExecutionCount(result.message, 'ark');

    // Handle specific Ark requirements
    this.handleArkSpecificRequirements(result, context);
  }

  private static convertForPythonKernel(result: ConversionResult, context: ConversionContext): void {
    // Convert to Python-compatible format
    result.message = this.makeFieldsOptionalForPython(result.message);
    result.message = this.convertNumericFields(result.message, false);
    result.message = this.normalizeStreamNames(result.message);
    result.message = this.normalizeExecutionCount(result.message, 'python');

    // Handle specific Python requirements
    this.handlePythonSpecificRequirements(result, context);
  }

  private static handleArkSpecificRequirements(result: ConversionResult, _context: ConversionContext): void {
    const content = result.message.content;

    switch (result.message.header.msg_type) {
      case 'execute_reply':
        // Ark doesn't support 'abort' status
        if (content.status === 'abort') {
          content.status = 'error';
          result.warnings.push('Converted abort status to error for Ark compatibility');
        }
        
        // Ensure user_expressions is always present
        if (!content.user_expressions) {
          content.user_expressions = {};
        }
        break;

      case 'complete_reply':
        // Ensure status comes first in Ark
        const { status, ...rest } = content;
        result.message.content = { status, ...rest };
        break;

      case 'is_complete_reply':
        // Ensure indent field is always present
        if (!content.indent) {
          content.indent = '';
        }
        break;

      case 'comm_close':
        // Ark only has comm_id, remove data field
        if ('data' in content) {
          delete content.data;
          result.warnings.push('Removed data field from comm_close for Ark compatibility');
        }
        break;
    }
  }

  private static handlePythonSpecificRequirements(result: ConversionResult, _context: ConversionContext): void {
    const content = result.message.content;

    switch (result.message.header.msg_type) {
      case 'inspect_request':
        // Python limits detail_level to 0 or 1
        if (content.detail_level !== undefined && content.detail_level > 1) {
          content.detail_level = 1;
          result.warnings.push('Limited detail_level to 1 for Python compatibility');
        }
        break;

      case 'kernel_info_reply':
        // Add standard Python fields that Ark might be missing
        if (!content.protocol_version) {
          content.protocol_version = '5.3';
        }
        if (!content.implementation) {
          content.implementation = 'ipykernel';
        }
        if (!content.implementation_version) {
          content.implementation_version = '6.0.0';
        }
        break;
    }
  }

  private static applyUniversalConversions(result: ConversionResult, _context: ConversionContext): void {
    // Ensure all messages have required basic structure
    if (!result.message.metadata) {
      result.message.metadata = {};
    }

    // Ensure buffers field is properly typed (can be undefined)
    if (!result.message.buffers || result.message.buffers.length === 0) {
      // Remove buffers field entirely if empty to maintain undefined type
      delete (result.message as any).buffers;
    }

    // Ensure zmq_identities is properly handled
    if (!result.message.zmq_identities) {
      result.message.zmq_identities = [];
    }

    // Validate and normalize header
    this.normalizeHeader(result.message);
  }

  private static normalizeHeader(message: JupyterMessage): void {
    const header = message.header;

    // Ensure version is set
    if (!header.version) {
      header.version = '5.3';
    }

    // Ensure date is in ISO format
    if (!header.date) {
      header.date = new Date().toISOString();
    } else {
      // Validate and normalize date format
      try {
        header.date = new Date(header.date).toISOString();
      } catch {
        header.date = new Date().toISOString();
      }
    }

    // Ensure username is set
    if (!header.username) {
      header.username = 'kernel';
    }
  }

  private static validateMessageContent(
    message: JupyterMessage,
    context: ConversionContext,
    result: MessageValidationResult
  ): void {
    const content = message.content;
    const msgType = message.header.msg_type;

    // Message-type specific validation
    switch (msgType) {
      case 'execute_request':
        if (typeof content.code !== 'string') {
          result.errors.push('execute_request requires string code field');
          result.isValid = false;
        }
        break;

      case 'execute_reply':
        if (!['ok', 'error', 'abort'].includes(content.status)) {
          result.errors.push('execute_reply requires valid status field');
          result.isValid = false;
        }
        if (context.kernelType === 'ark' && content.status === 'abort') {
          result.warnings.push('Ark kernel does not support abort status');
        }
        break;

      case 'stream':
        if (!['stdout', 'stderr'].includes(content.name)) {
          result.errors.push('stream message requires valid name field (stdout/stderr)');
          result.isValid = false;
        }
        if (typeof content.text !== 'string') {
          result.errors.push('stream message requires string text field');
          result.isValid = false;
        }
        break;

      case 'complete_request':
        if (typeof content.code !== 'string') {
          result.errors.push('complete_request requires string code field');
          result.isValid = false;
        }
        if (typeof content.cursor_pos !== 'number') {
          result.errors.push('complete_request requires number cursor_pos field');
          result.isValid = false;
        }
        break;

      case 'comm_open':
        if (typeof content.comm_id !== 'string') {
          result.errors.push('comm_open requires string comm_id field');
          result.isValid = false;
        }
        if (typeof content.target_name !== 'string') {
          result.errors.push('comm_open requires string target_name field');
          result.isValid = false;
        }
        break;
    }

    // Kernel-specific validations
    if (context.kernelType === 'ark') {
      this.validateArkSpecificContent(message, result);
    } else if (context.kernelType === 'python') {
      this.validatePythonSpecificContent(message, result);
    }
  }

  private static validateArkSpecificContent(
    message: JupyterMessage,
    result: MessageValidationResult
  ): void {
    const content = message.content;
    const msgType = message.header.msg_type;

    // Check for Ark-required fields
    if (msgType === 'display_data' && !content.transient) {
      result.warnings.push('Ark requires transient field in display_data');
    }

    if (msgType === 'is_complete_reply' && !content.indent) {
      result.warnings.push('Ark requires indent field in is_complete_reply');
    }

    // Check for fields missing in Ark
    if (msgType === 'execute_reply' && content.payload) {
      result.warnings.push('Ark does not support payload field in execute_reply');
    }

    if (msgType === 'comm_close' && content.data) {
      result.warnings.push('Ark does not support data field in comm_close');
    }
  }

  private static validatePythonSpecificContent(
    message: JupyterMessage,
    result: MessageValidationResult
  ): void {
    const content = message.content;
    const msgType = message.header.msg_type;

    // Check for Python-specific requirements
    if (msgType === 'inspect_request' && content.detail_level > 1) {
      result.warnings.push('Python typically limits detail_level to 0 or 1');
    }
  }

  private static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as unknown as T;
    }

    if (obj instanceof Buffer) {
      return Buffer.from(obj.buffer, obj.byteOffset, obj.byteLength) as unknown as T;
    }

    if (typeof obj === 'object') {
      const cloned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = this.deepClone(obj[key]);
        }
      }
      return cloned;
    }

    return obj;
  }

  /**
   * Batch convert multiple messages
   */
  static convertMessages(
    messages: JupyterMessage[],
    context: ConversionContext
  ): ConversionResult[] {
    return messages.map(message => this.convertMessageForKernel(message, context));
  }

  /**
   * Get supported message types for a kernel
   */
  static getSupportedMessageTypes(kernelType: KernelType): string[] {
    const commonTypes = [
      'execute_request', 'execute_reply', 'execute_result',
      'stream', 'display_data', 'error',
      'status', 'complete_request', 'complete_reply',
      'inspect_request', 'inspect_reply',
      'is_complete_request', 'is_complete_reply',
      'comm_open', 'comm_msg', 'comm_close',
      'input_request', 'input_reply',
      'interrupt_request', 'interrupt_reply',
      'shutdown_request', 'shutdown_reply',
      'kernel_info_request', 'kernel_info_reply'
    ];

    if (kernelType === 'python') {
      return [...commonTypes, 'history_request', 'history_reply'];
    }

    // Ark kernel doesn't support history messages
    return commonTypes;
  }

  /**
   * Check if a message type is supported by the kernel
   */
  static isMessageTypeSupported(msgType: string, kernelType: KernelType): boolean {
    return this.getSupportedMessageTypes(kernelType).includes(msgType);
  }
}
