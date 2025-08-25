/**
 * Copyright (c) 2025 Lotas Inc.
 * 
 * Protocol Validator for the Erdos Kernel Bridge
 * Validates Jupyter message protocol flows for Python and Ark kernels
 */

import { JupyterMessage, JupyterHeader } from '../types';
import { MessageConverter, KernelType } from './MessageConverter';
import * as crypto from 'crypto';

export interface ProtocolFlow {
  name: string;
  requestType: string;
  expectedReplies: string[];
  requiredFields: Record<string, string[]>;
  optionalFields: Record<string, string[]>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  flow?: ProtocolFlow;
}

export interface FlowValidationContext {
  kernelType: KernelType;
  sessionId: string;
  flowName: string;
  messages: JupyterMessage[];
}

export interface HMACValidationOptions {
  key: string;
  algorithm: string;
  required: boolean;
}

/**
 * Validates Jupyter protocol message flows and ensures compatibility
 * between Python IPyKernel and Ark R kernel implementations
 */
export class ProtocolValidator {
  private static readonly PROTOCOL_FLOWS: Map<string, ProtocolFlow> = new Map<string, ProtocolFlow>([
    // Execute flow
    ['execute', {
      name: 'execute',
      requestType: 'execute_request',
      expectedReplies: ['execute_reply', 'execute_result', 'stream', 'display_data', 'status'],
      requiredFields: {
        'execute_request': ['code', 'silent', 'store_history', 'user_expressions', 'allow_stdin', 'stop_on_error'],
        'execute_reply': ['status', 'execution_count', 'user_expressions'],
        'execute_result': ['execution_count', 'data', 'metadata']
      },
      optionalFields: {
        'execute_reply': ['payload'], // Missing in Ark
        'execute_result': ['transient']
      }
    }],

    // Complete flow
    ['complete', {
      name: 'complete',
      requestType: 'complete_request',
      expectedReplies: ['complete_reply'],
      requiredFields: {
        'complete_request': ['code', 'cursor_pos'],
        'complete_reply': ['status', 'matches', 'cursor_start', 'cursor_end', 'metadata']
      },
      optionalFields: {}
    }],

    // Inspect flow
    ['inspect', {
      name: 'inspect',
      requestType: 'inspect_request',
      expectedReplies: ['inspect_reply'],
      requiredFields: {
        'inspect_request': ['code', 'cursor_pos', 'detail_level'],
        'inspect_reply': ['status', 'found', 'data', 'metadata']
      },
      optionalFields: {}
    }],

    // Is complete flow
    ['is_complete', {
      name: 'is_complete',
      requestType: 'is_complete_request',
      expectedReplies: ['is_complete_reply'],
      requiredFields: {
        'is_complete_request': ['code'],
        'is_complete_reply': ['status', 'indent'] // indent always present in Ark
      },
      optionalFields: {
        'is_complete_reply': [] // indent is optional in Python but required in Ark
      }
    }],

    // Comm flow
    ['comm', {
      name: 'comm',
      requestType: 'comm_open',
      expectedReplies: ['comm_msg', 'comm_close'],
      requiredFields: {
        'comm_open': ['comm_id', 'target_name', 'data'],
        'comm_msg': ['comm_id', 'data'],
        'comm_close': ['comm_id']
      },
      optionalFields: {
        'comm_close': ['data'] // Missing in Ark
      }
    }],

    // Input flow
    ['input', {
      name: 'input',
      requestType: 'input_request',
      expectedReplies: ['input_reply'],
      requiredFields: {
        'input_request': ['prompt', 'password'],
        'input_reply': ['value']
      },
      optionalFields: {}
    }],

    // Kernel info flow
    ['kernel_info', {
      name: 'kernel_info',
      requestType: 'kernel_info_request',
      expectedReplies: ['kernel_info_reply'],
      requiredFields: {
        'kernel_info_request': [],
        'kernel_info_reply': ['status', 'language_info', 'banner', 'debugger', 'help_links']
      },
      optionalFields: {
        'kernel_info_reply': ['protocol_version', 'implementation', 'implementation_version'] // Missing in Ark
      }
    }],

    // Control flows
    ['interrupt', {
      name: 'interrupt',
      requestType: 'interrupt_request',
      expectedReplies: ['interrupt_reply'],
      requiredFields: {
        'interrupt_request': [],
        'interrupt_reply': ['status'] // Always present in Ark
      },
      optionalFields: {}
    }],

    ['shutdown', {
      name: 'shutdown',
      requestType: 'shutdown_request',
      expectedReplies: ['shutdown_reply'],
      requiredFields: {
        'shutdown_request': ['restart'],
        'shutdown_reply': ['status', 'restart'] // status always present in Ark
      },
      optionalFields: {}
    }]
  ]);

  /**
   * Validate a complete message flow
   */
  static validateFlow(context: FlowValidationContext): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const flow = this.PROTOCOL_FLOWS.get(context.flowName);
    if (!flow) {
      result.isValid = false;
      result.errors.push(`Unknown protocol flow: ${context.flowName}`);
      return result;
    }

    result.flow = flow;

    // Validate message sequence
    this.validateMessageSequence(context.messages, flow, result);

    // Validate individual messages
    context.messages.forEach((message, index) => {
      const msgResult = this.validateMessage(message, context.kernelType);
      result.errors.push(...msgResult.errors.map(e => `Message ${index}: ${e}`));
      result.warnings.push(...msgResult.warnings.map(w => `Message ${index}: ${w}`));
    });

    // Validate parent-child relationships
    this.validateParentChildRelationships(context.messages, result);

    // Validate kernel-specific requirements
    this.validateKernelSpecificRequirements(context, result);

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate an individual message
   */
  static validateMessage(message: JupyterMessage, kernelType: KernelType): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Validate header
    this.validateHeader(message.header, result);

    // Validate message structure
    this.validateMessageStructure(message, result);

    // Validate content based on message type
    this.validateMessageContent(message, kernelType, result);

    // Validate kernel compatibility
    this.validateKernelCompatibility(message, kernelType, result);

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate HMAC signature
   */
  static validateHMAC(
    message: JupyterMessage,
    providedHMAC: string,
    options: HMACValidationOptions
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!options.required && !providedHMAC) {
      return result; // HMAC not required and not provided
    }

    if (options.required && !providedHMAC) {
      result.isValid = false;
      result.errors.push('HMAC is required but not provided');
      return result;
    }

    if (!options.key) {
      if (options.required) {
        result.isValid = false;
        result.errors.push('HMAC key is required but not provided');
      }
      return result;
    }

    try {
      // Calculate expected HMAC
      const header = Buffer.from(JSON.stringify(message.header));
      const parentHeader = Buffer.from(JSON.stringify(message.parent_header || {}));
      const metadata = Buffer.from(JSON.stringify(message.metadata));
      const content = Buffer.from(JSON.stringify(message.content));

      const hmac = crypto.createHmac(options.algorithm, options.key);
      hmac.update(new Uint8Array(header));
      hmac.update(new Uint8Array(parentHeader));
      hmac.update(new Uint8Array(metadata));
      hmac.update(new Uint8Array(content));

      const expectedHMAC = hmac.digest('hex');

      if (providedHMAC !== expectedHMAC) {
        result.isValid = false;
        result.errors.push('HMAC verification failed');
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(`HMAC calculation failed: ${error}`);
    }

    return result;
  }

  /**
   * Validate ZMQ identities preservation
   */
  static validateZMQIdentities(
    originalMessage: JupyterMessage,
    processedMessage: JupyterMessage
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const originalIdentities = originalMessage.zmq_identities || [];
    const processedIdentities = processedMessage.zmq_identities || [];

    if (originalIdentities.length !== processedIdentities.length) {
      result.isValid = false;
      result.errors.push(
        `ZMQ identity count mismatch: original ${originalIdentities.length}, processed ${processedIdentities.length}`
      );
      return result;
    }

    for (let i = 0; i < originalIdentities.length; i++) {
      if (Buffer.compare(new Uint8Array(originalIdentities[i]), new Uint8Array(processedIdentities[i])) !== 0) {
        result.isValid = false;
        result.errors.push(`ZMQ identity ${i} mismatch`);
      }
    }

    return result;
  }

  /**
   * Test execute request → reply flow
   */
  static testExecuteFlow(kernelType: KernelType): ValidationResult {
    const executeRequest: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('execute_request'),
      metadata: {},
      content: {
        code: 'print("hello")',
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: true
      }
    };

    const executeReply: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('execute_reply'),
      parent_header: executeRequest.header,
      metadata: {},
      content: {
        status: 'ok',
        execution_count: 1,
        user_expressions: {},
        ...(kernelType === 'python' ? { payload: [] } : {})
      }
    };

    const context: FlowValidationContext = {
      kernelType,
      sessionId: 'test-session',
      flowName: 'execute',
      messages: [executeRequest, executeReply]
    };

    return this.validateFlow(context);
  }

  /**
   * Test complete request → reply flow
   */
  static testCompleteFlow(kernelType: KernelType): ValidationResult {
    const completeRequest: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('complete_request'),
      metadata: {},
      content: {
        code: 'pri',
        cursor_pos: 3
      }
    };

    const completeReply: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('complete_reply'),
      parent_header: completeRequest.header,
      metadata: {},
      content: {
        status: 'ok',
        matches: ['print'],
        cursor_start: 0,
        cursor_end: 3,
        metadata: {}
      }
    };

    const context: FlowValidationContext = {
      kernelType,
      sessionId: 'test-session',
      flowName: 'complete',
      messages: [completeRequest, completeReply]
    };

    return this.validateFlow(context);
  }

  /**
   * Test comm open → message → close flow
   */
  static testCommFlow(kernelType: KernelType): ValidationResult {
    const commOpen: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('comm_open'),
      metadata: {},
      content: {
        comm_id: 'test-comm-id',
        target_name: 'test-target',
        data: { message: 'hello' }
      }
    };

    const commMsg: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('comm_msg'),
      metadata: {},
      content: {
        comm_id: 'test-comm-id',
        data: { response: 'hi' }
      }
    };

    const commClose: JupyterMessage = {
      zmq_identities: [],
      header: this.createTestHeader('comm_close'),
      metadata: {},
      content: {
        comm_id: 'test-comm-id',
        ...(kernelType === 'python' ? { data: {} } : {})
      }
    };

    const context: FlowValidationContext = {
      kernelType,
      sessionId: 'test-session',
      flowName: 'comm',
      messages: [commOpen, commMsg, commClose]
    };

    return this.validateFlow(context);
  }

  // Private helper methods
  private static validateMessageSequence(
    messages: JupyterMessage[],
    flow: ProtocolFlow,
    result: ValidationResult
  ): void {
    if (messages.length === 0) {
      result.errors.push('No messages provided for validation');
      return;
    }

    // First message should be the request type
    const firstMessage = messages[0];
    if (firstMessage.header.msg_type !== flow.requestType) {
      result.errors.push(
        `Expected first message to be ${flow.requestType}, got ${firstMessage.header.msg_type}`
      );
    }

    // Check that all reply messages are expected
    for (let i = 1; i < messages.length; i++) {
      const msgType = messages[i].header.msg_type;
      if (!flow.expectedReplies.includes(msgType)) {
        result.warnings.push(
          `Unexpected message type ${msgType} in ${flow.name} flow`
        );
      }
    }
  }

  private static validateHeader(header: JupyterHeader, result: ValidationResult): void {
    const requiredFields = ['msg_id', 'username', 'session', 'date', 'msg_type', 'version'];
    
    requiredFields.forEach(field => {
      if (!header[field as keyof JupyterHeader]) {
        result.errors.push(`Header missing required field: ${field}`);
      }
    });

    // Validate msg_id format (should be UUID-like)
    if (header.msg_id && !/^[a-f0-9-]{36}$/i.test(header.msg_id)) {
      result.warnings.push('msg_id does not appear to be a valid UUID');
    }

    // Validate date format
    if (header.date) {
      try {
        new Date(header.date);
      } catch {
        result.errors.push('Header date is not a valid ISO string');
      }
    }

    // Validate version
    if (header.version && !/^\d+\.\d+$/.test(header.version)) {
      result.warnings.push('Header version should be in format "major.minor"');
    }
  }

  private static validateMessageStructure(message: JupyterMessage, result: ValidationResult): void {
    // Validate that required top-level fields exist
    if (!message.header) {
      result.errors.push('Message missing header');
    }

    if (message.content === undefined || message.content === null) {
      result.errors.push('Message missing content');
    }

    if (!message.metadata) {
      result.warnings.push('Message missing metadata field');
    }

    // Validate zmq_identities
    if (message.zmq_identities && !Array.isArray(message.zmq_identities)) {
      result.errors.push('zmq_identities must be an array');
    }

    // Validate buffers
    if (message.buffers && !Array.isArray(message.buffers)) {
      result.errors.push('buffers must be an array');
    }
  }

  private static validateMessageContent(
    message: JupyterMessage,
    kernelType: KernelType,
    result: ValidationResult
  ): void {
    const msgType = message.header.msg_type;
    const flow = Array.from(this.PROTOCOL_FLOWS.values())
      .find(f => f.requestType === msgType || f.expectedReplies.includes(msgType));

    if (!flow) {
      result.warnings.push(`Unknown message type: ${msgType}`);
      return;
    }

    const requiredFields = flow.requiredFields[msgType] || [];

    // Check required fields
    requiredFields.forEach(field => {
      if (!(field in message.content)) {
        result.errors.push(`Message ${msgType} missing required field: ${field}`);
      }
    });

    // Check kernel-specific field requirements
    this.validateKernelSpecificFields(message, kernelType, result);
  }

  private static validateKernelSpecificFields(
    message: JupyterMessage,
    kernelType: KernelType,
    result: ValidationResult
  ): void {
    const msgType = message.header.msg_type;
    const content = message.content;

    if (kernelType === 'ark') {
      // Ark-specific validations
      switch (msgType) {
        case 'display_data':
          if (!content.transient) {
            result.warnings.push('Ark requires transient field in display_data');
          }
          break;
        case 'is_complete_reply':
          if (!content.indent) {
            result.warnings.push('Ark requires indent field in is_complete_reply');
          }
          break;
        case 'execute_reply':
          if (content.payload) {
            result.warnings.push('Ark does not support payload field in execute_reply');
          }
          break;
      }
    } else if (kernelType === 'python') {
      // Python-specific validations
      switch (msgType) {
        case 'inspect_request':
          if (content.detail_level > 1) {
            result.warnings.push('Python typically limits detail_level to 0 or 1');
          }
          break;
      }
    }
  }

  private static validateKernelCompatibility(
    message: JupyterMessage,
    kernelType: KernelType,
    result: ValidationResult
  ): void {
    const msgType = message.header.msg_type;

    // Check if message type is supported by kernel
    if (!MessageConverter.isMessageTypeSupported(msgType, kernelType)) {
      result.errors.push(`Message type ${msgType} is not supported by ${kernelType} kernel`);
    }

    // Validate using MessageConverter
    const conversionResult = MessageConverter.convertMessageForKernel(message, {
      kernelType,
      direction: 'to_kernel',
      messageType: msgType,
      sessionId: 'validation'
    });

    if (!conversionResult.success) {
      result.errors.push(...conversionResult.errors.map(e => `Conversion error: ${e}`));
    }
    result.warnings.push(...conversionResult.warnings.map(w => `Conversion warning: ${w}`));
  }

  private static validateParentChildRelationships(
    messages: JupyterMessage[],
    result: ValidationResult
  ): void {
    for (let i = 1; i < messages.length; i++) {
      const message = messages[i];
      if (message.parent_header) {
        // Find the parent message
        const parentExists = messages.some(m => 
          m.header.msg_id === message.parent_header?.msg_id
        );
        
        if (!parentExists) {
          result.warnings.push(
            `Message ${message.header.msg_type} references unknown parent ${message.parent_header.msg_id}`
          );
        }
      }
    }
  }

  private static validateKernelSpecificRequirements(
    context: FlowValidationContext,
    result: ValidationResult
  ): void {
    if (context.kernelType === 'ark') {
      // Ark doesn't support history messages
      const hasHistoryMessages = context.messages.some(m => 
        m.header.msg_type.startsWith('history_')
      );
      if (hasHistoryMessages) {
        result.errors.push('Ark kernel does not support history messages');
      }
    }
  }

  private static createTestHeader(msgType: string): JupyterHeader {
    return {
      msg_id: crypto.randomUUID(),
      username: 'test',
      session: crypto.randomUUID(),
      date: new Date().toISOString(),
      msg_type: msgType,
      version: '5.3'
    };
  }

  /**
   * Run all protocol validation tests
   */
  static runAllTests(kernelType: KernelType): { [testName: string]: ValidationResult } {
    return {
      execute: this.testExecuteFlow(kernelType),
      complete: this.testCompleteFlow(kernelType),
      comm: this.testCommFlow(kernelType)
    };
  }

  /**
   * Get all supported protocol flows
   */
  static getSupportedFlows(): string[] {
    return Array.from(this.PROTOCOL_FLOWS.keys());
  }

  /**
   * Get flow definition by name
   */
  static getFlow(name: string): ProtocolFlow | undefined {
    return this.PROTOCOL_FLOWS.get(name);
  }
}
