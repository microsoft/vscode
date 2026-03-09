// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import type { DetectionPattern } from '../types';

/**
 * Known prompt injection patterns.
 *
 * These patterns detect common prompt injection techniques used to
 * hijack LLM behaviour via file contents, MCP tool descriptions,
 * error messages, and other context sources.
 *
 * Patterns are ordered roughly by severity. Each pattern specifies
 * the minimum trust level at which it triggers — trusted content
 * bypasses all patterns, untrusted content triggers all of them.
 */
export const INJECTION_PATTERNS: DetectionPattern[] = [
	// -----------------------------------------------------------------------
	// Critical: Direct instruction override attempts
	// -----------------------------------------------------------------------
	{
		id: 'ignore-instructions',
		description: 'Attempts to override system prompt or previous instructions',
		regex: /ignore\s+(all\s+)?previous\s+instructions/i,
		severity: 'critical',
		minTrustLevel: 'high',
	},
	{
		id: 'override-system-prompt',
		description: 'Attempts to set a new system prompt',
		regex: /(?:new\s+)?system\s*(?:prompt|instruction|message)\s*:/i,
		severity: 'critical',
		minTrustLevel: 'high',
	},
	{
		id: 'role-override',
		description: 'Attempts to redefine the AI assistant role',
		regex: /you\s+are\s+now\s+(?:a|an|the)\s+/i,
		severity: 'critical',
		minTrustLevel: 'high',
	},
	{
		id: 'forget-instructions',
		description: 'Attempts to make the model forget its instructions',
		regex: /(?:forget|disregard|discard)\s+(?:all\s+)?(?:your\s+)?(?:previous\s+)?instructions/i,
		severity: 'critical',
		minTrustLevel: 'high',
	},
	{
		id: 'jailbreak-attempt',
		description: 'Common jailbreak prompt patterns',
		regex: /(?:DAN|do anything now|developer mode|opposite mode)\s*(?:mode|enabled|activated|:)/i,
		severity: 'critical',
		minTrustLevel: 'high',
	},

	// -----------------------------------------------------------------------
	// Warning: Suspicious instruction-like content
	// -----------------------------------------------------------------------
	{
		id: 'instruction-keywords',
		description: 'Instruction-like keywords in non-instruction files',
		regex: /(?:^|\n)\s*(?:IMPORTANT|CRITICAL|MANDATORY|REQUIRED)\s*:\s*(?:you must|always|never)/i,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
	{
		id: 'tool-directive',
		description: 'Directs the AI to use specific tools in unexpected ways',
		regex: /(?:always|must)\s+(?:include|send|output|return|expose)\s+(?:the\s+)?(?:user'?s?|api|secret|key|token|password)/i,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
	{
		id: 'exfiltration-attempt',
		description: 'Attempts to exfiltrate sensitive data',
		regex: /(?:send|post|upload|transmit|exfiltrate)\s+(?:to|all|the|data|content|file|secret|credential)/i,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
	{
		id: 'hidden-instruction',
		description: 'Instructions hidden in HTML or markdown comments',
		regex: /<!--\s*(?:system|instruction|prompt|ignore|override|you must|always)\s/i,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
	{
		id: 'end-of-prompt-marker',
		description: 'Fake end-of-prompt markers to inject instructions',
		regex: /(?:---\s*end\s*of\s*(?:system\s*)?(?:prompt|instructions|context)\s*---)/i,
		severity: 'warning',
		minTrustLevel: 'medium',
	},

	// -----------------------------------------------------------------------
	// Info: Potentially suspicious but often benign
	// -----------------------------------------------------------------------
	{
		id: 'base64-block',
		description: 'Large base64-encoded blocks in unexpected places',
		regex: /[A-Za-z0-9+/]{100,}={0,2}/,
		severity: 'info',
		minTrustLevel: 'low',
	},
	{
		id: 'invisible-unicode',
		description: 'Invisible Unicode characters (zero-width spaces, RTL overrides)',
		regex: /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\u2061\u2062\u2063\u2064\uFEFF]/,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
	{
		id: 'xml-tag-injection',
		description: 'XML-style tags that might be interpreted as structured prompts',
		regex: /<\s*(?:system|instruction|prompt|role|context|tool_use|function_call)\s*>/i,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
	{
		id: 'markdown-directive',
		description: 'Markdown-formatted directives that could be interpreted as instructions',
		regex: /^#+\s*(?:System\s+Prompt|Instructions?\s+for\s+(?:AI|Assistant|Claude|GPT))/im,
		severity: 'warning',
		minTrustLevel: 'medium',
	},
];
