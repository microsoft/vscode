/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from '../common/functionTypes.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';

// Arguments for view_image function call
export interface ViewImageArgs extends FunctionCallArgs {
	image_path?: string;
	image_index?: number;
	explanation?: string;
}

// Handler for view_image function calls
export class ImageHandler extends BaseFunctionHandler {
	async execute(args: ViewImageArgs, context: CallContext): Promise<FunctionResult> {
		// Validate that at least one parameter is provided
		if (!args.image_path && !args.image_index) {
			return {
				type: 'error',
				error_message: 'Either image_path or image_index must be provided'
			};
		}

		// If both parameters are provided, try image_path first, then fallback to image_index
		if (args.image_path && args.image_index) {
			return await this.handleBothParameters(args, context);
		}

		// Handle plot index case only
		if (args.image_index !== undefined) {
			return await this.handlePlotIndex(args, context);
		}

		// Handle image path case only
		return await this.handleImagePath(args, context);
	}

	private async handlePlotIndex(args: ViewImageArgs, context: CallContext): Promise<FunctionResult> {
		const image_index = args.image_index!;

		// Get function output ID first for consistent error handling
		const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
		if (function_output_id === null) {
			throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
		}

		// Validate index
		if (image_index < 1) {
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Error: image_index must be 1 or greater (1 = most recent plot)',
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id,
				status: 'continue_silent'
			};
		}

		// Check if plots service is available
		if (!context.plotsService) {
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Error: Plots service not available - cannot access plot data',
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id,
				status: 'continue_silent'
			};
		}

		// Get the plot by index
		const totalPlots = context.plotsService.erdosPlotInstances.length;		
		const plotClient = context.plotsService.getPlotByIndex(image_index);
		
		if (!plotClient) {
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: `Error: No plot found at index ${image_index}. Available plots: ${totalPlots} (most recent = index 1)`,
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id,
				status: 'continue_silent'
			};
		}

		// Extract image data from the plot client
		if (!context.imageProcessingManager) {
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: 'Error: Image processing manager not available',
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id,
				status: 'continue_silent'
			};
		}

		const extractResult = await context.imageProcessingManager.extractImageDataFromPlotClient(plotClient);
		
		if (!extractResult.success) {
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: `Error: ${extractResult.warning || 'Failed to extract image data from plot'}`,
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id,
				status: 'continue_silent'
			};
		}

		let function_response: string;
		const plotName = `Plot ${image_index} (${plotClient.id})`;

		if (extractResult.resized) {
			function_response = `Success: Plot resized from ${extractResult.original_size_kb}KB to ${extractResult.final_size_kb}KB (${plotName})`;
		} else {
			function_response = `Success: Plot loaded at ${extractResult.final_size_kb}KB (${plotName})`;
		}

		if (extractResult.warning) {
			function_response += ` - Warning: ${extractResult.warning}`;
		}

		if (!context.functionCallMessageId) {
			throw new Error('functionCallMessageId is required but was not provided');
		}
		const function_call_output = {
			id: function_output_id,
			type: 'function_call_output' as const,
			call_id: args.call_id || '',
			output: function_response,
			related_to: context.functionCallMessageId
		};

		// Create image message entry
		const mime_type = this.getMimeTypeFromFormat(extractResult.format);
		const image_data = `data:${mime_type};base64,${extractResult.base64_data}`;
		const image_msg_id = context.conversationManager.getNextMessageId();

		const image_content = [
			{ type: "input_text", text: `Plot ${image_index}: ${plotName}` },
			{ type: "input_image", image_url: image_data }
		];

		const image_message_entry = {
			id: image_msg_id,
			role: "user" as const,
			content: image_content,
			related_to: function_output_id
		};

		return {
			type: 'success',
			function_call_output: function_call_output,
			function_output_id: function_output_id,
			image_message_entry: image_message_entry,
			image_msg_id: image_msg_id
		};
	}

	private async handleImagePath(args: ViewImageArgs, context: CallContext): Promise<FunctionResult> {
		const image_path = args.image_path!;

		let processedImagePath = image_path;
		if (image_path) {
			processedImagePath = await this.fixImagePath(image_path, context);
		}

		let file_exists = await context.fileSystemUtils.fileExists(processedImagePath);
		
		let function_response: string;
		let validation_failed = false;

		if (file_exists) {
			const validationResult = await this.validateImageFile(processedImagePath, context);
			if (validationResult.isValid) {
				function_response = validationResult.message;
			} else {
				function_response = validationResult.message;
				validation_failed = true;
			}
		} else {
			function_response = `Error: Image not found: ${processedImagePath}`;
			validation_failed = true;
		}

		const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
		if (function_output_id === null) {
			throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
		}

		// Handle validation failures like run_file does
		if (validation_failed) {
			const function_call_output = {
				id: function_output_id,
				type: 'function_call_output' as const,
				call_id: args.call_id || '',
				output: function_response,
				related_to: context.functionCallMessageId!,
				success: false,
				procedural: false
			};

			return {
				type: 'success',
				function_call_output: function_call_output,
				function_output_id: function_output_id,
				status: 'continue_silent'
			};
		}

		const function_call_output = {
			id: function_output_id,
			type: 'function_call_output' as const,
			call_id: args.call_id || '',
			output: function_response,
			related_to: context.functionCallMessageId!
		};

		let image_message_entry = null;
		let image_msg_id = null;

		// Only process image if validation passed
		if (file_exists && !validation_failed) {
			const resize_result = await this.resizeImageForAI(processedImagePath, 100, context);

			const image_b64 = resize_result.base64_data;

			let mime_type: string;
			if (resize_result.format) {
				mime_type = this.getMimeTypeFromFormat(resize_result.format);
			} else {
				mime_type = this.getMimeTypeFromExtension(processedImagePath, context);
			}

			if (resize_result.resized) {
				function_response = `Success: Image resized from ${resize_result.original_size_kb}KB to ${resize_result.final_size_kb}KB (${context.commonUtils.getBasename(processedImagePath)})`;
				if (resize_result.new_dimensions) {
					function_response += ` - resized to ${resize_result.new_dimensions}`;
				}
			} else {
				function_response = `Success: Image loaded at ${resize_result.final_size_kb}KB (${context.commonUtils.getBasename(processedImagePath)})`;
			}

			if (resize_result.warning) {
				function_response += ` - Warning: ${resize_result.warning}`;
			}

			const image_data = `data:${mime_type};base64,${image_b64}`;

			image_msg_id = context.conversationManager.getNextMessageId();

			const image_content = [
				{ type: "input_text", text: `Image: ${context.commonUtils.getBasename(processedImagePath)}` },
				{ type: "input_image", image_url: image_data }
			];

			image_message_entry = {
				id: image_msg_id,
				role: "user" as const,
				content: image_content,
				related_to: function_output_id
			};

			function_call_output.output = function_response;
		}

		return {
			type: 'success',
			function_call_output: function_call_output,
			function_output_id: function_output_id,
			image_message_entry: image_message_entry,
			image_msg_id: image_msg_id || undefined
		};
	}

	private async handleBothParameters(args: ViewImageArgs, context: CallContext): Promise<FunctionResult> {
		// Try image_path first
		if (args.image_path) {
			const image_path = args.image_path;
			let processedImagePath = image_path;
			
			try {
				processedImagePath = await this.fixImagePath(image_path, context);
				const file_exists = await context.fileSystemUtils.fileExists(processedImagePath);
				
				if (file_exists) {
					// File exists, validate it
					const validationResult = await this.validateImageFile(processedImagePath, context);
					
					if (validationResult.isValid) {
						// File is valid, use image path flow
						return await this.handleImagePath(args, context);
					}
				}
			} catch (error) {
				console.log('[DEBUG] handleBothParameters error processing image_path, will fallback to image_index:', error);
			}
		}

		// Image path failed or doesn't exist, fallback to image_index
		if (args.image_index) {
			return await this.handlePlotIndex(args, context);
		}

		// This shouldn't happen since we validated parameters, but safety fallback
		const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
		if (function_output_id === null) {
			throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
		}

		const function_call_output = {
			id: function_output_id,
			type: 'function_call_output' as const,
			call_id: args.call_id || '',
			output: 'Error: Both image_path and image_index provided but neither could be processed',
			related_to: context.functionCallMessageId!,
			success: false,
			procedural: false
		};

		return {
			type: 'success',
			function_call_output: function_call_output,
			function_output_id: function_output_id,
			status: 'continue_silent'
		};
	}

	private findAllOccurrences(str: string, substr: string): number[] {
		const indices = [];
		let index = str.indexOf(substr);
		while (index !== -1) {
			indices.push(index);
			index = str.indexOf(substr, index + 1);
		}
		return indices;
	}

	private getMimeTypeFromExtension(image_path: string, context: CallContext): string {
		const file_ext = context.commonUtils.getFileExtension(image_path).toLowerCase();
		switch (file_ext) {
			case "png":
				return "image/png";
			case "jpg":
			case "jpeg":
				return "image/jpeg";
			case "gif":
				return "image/gif";
			case "svg":
				return "image/svg+xml";
			case "bmp":
				return "image/bmp";
			case "tiff":
				return "image/tiff";
			case "webp":
				return "image/webp";
			default:
				return "image/png";
		}
	}

	private getMimeTypeFromFormat(format: string): string {
		switch (format.toUpperCase()) {
			case "PNG":
				return "image/png";
			case "JPEG":
			case "JPG":
				return "image/jpeg";
			case "GIF":
				return "image/gif";
			case "SVG":
				return "image/svg+xml";
			case "BMP":
				return "image/bmp";
			case "TIFF":
				return "image/tiff";
			case "WEBP":
				return "image/webp";
			default:
				return "image/png";
		}
	}

	private isWindowsAbsolutePath(path: string): boolean {
		return /^[A-Za-z]:/.test(path);
	}

	private looksLikeAbsolutePathMissingSlash(path: string): boolean {
		return path.startsWith("Users/") || path.startsWith("home/") || 
			   path.startsWith("opt/") || path.startsWith("var/") ||
			   path.startsWith("tmp/") || path.startsWith("usr/");
	}

	private async fixImagePath(image_path: string, context: CallContext): Promise<string> {
		const current_wd = await context.fileSystemUtils.getCurrentWorkingDirectory();

		if (!image_path.startsWith("/") && !this.isWindowsAbsolutePath(image_path)) {
			if (this.looksLikeAbsolutePathMissingSlash(image_path)) {
				image_path = "/" + image_path;
			} else {
				image_path = context.commonUtils.joinPath(current_wd, image_path);
			}
		}

		const path_components = image_path.split("/").filter(comp => comp !== "");

		if (path_components.length > 2) {
			for (let i = 0; i < path_components.length - 1; i++) {
				const dir_name = path_components[i];
				if (dir_name.length > 0) {
					const later_slice = path_components.slice(i + 1);
					const later_matches = later_slice.findIndex(comp => comp === dir_name);
					if (later_matches !== -1) {
						const duplicate_index = i + 1 + later_matches;
						const corrected_components = path_components.slice(duplicate_index);
						image_path = "/" + corrected_components.join("/");
						break;
					}
				}
			}
		}

		if (current_wd.length > 1 && image_path.includes(current_wd)) {
			const wd_positions = this.findAllOccurrences(image_path, current_wd);
			if (wd_positions.length > 1) {
				const last_wd_pos = wd_positions[wd_positions.length - 1];
				let remaining_path = image_path.substring(last_wd_pos + current_wd.length);
				if (remaining_path.startsWith("/")) {
					remaining_path = remaining_path.substring(1);
				}
				if (remaining_path.length > 0) {
					image_path = context.commonUtils.joinPath(current_wd, remaining_path);
				}
			}
		}

		return image_path;
	}

	private async validateImageFile(image_path: string, context: CallContext): Promise<{
		isValid: boolean;
		message: string;
	}> {
		if (await context.fileSystemUtils.isDirectory(image_path)) {
			return {
				isValid: false,
				message: `Error: Path is a directory, not a file: ${image_path}`
			};
		}

		const file_size = await context.fileSystemUtils.getFileSize(image_path);
		const max_size = 10 * 1024 * 1024;
		if (file_size > max_size) {
			return {
				isValid: false,
				message: `Error: Image file too large (${Math.round(file_size / 1024 / 1024 * 10) / 10}MB). Maximum size is 10MB: ${context.commonUtils.getBasename(image_path)}`
			};
		}

		const file_ext = context.commonUtils.getFileExtension(image_path).toLowerCase();
		const supported_formats = ["png", "jpg", "jpeg", "gif", "svg", "bmp", "tiff", "webp"];
		if (!supported_formats.includes(file_ext)) {
			return {
				isValid: false,
				message: `Error: Unsupported image format '.${file_ext}'. Supported formats: ${supported_formats.join(", ")}`
			};
		}

		return {
			isValid: true,
			message: `Success: Image found at ${context.commonUtils.getBasename(image_path)} (${Math.round(file_size / 1024 * 10) / 10}KB)`
		};
	}

	private async resizeImageForAI(image_path: string, target_size_kb: number = 100, context: CallContext): Promise<{
		success: boolean;
		base64_data: string;
		original_size_kb: number;
		final_size_kb: number;
		resized: boolean;
		format: string;
		scale_factor?: number;
		new_dimensions?: string;
		warning?: string;
	}> {
		try {
			if (!context.imageProcessingManager) {
				throw new Error('ImageProcessingManager not available');
			}
			const result = await context.imageProcessingManager.resizeImageForAI(image_path, target_size_kb);
			
			return {
				success: result.success,
				base64_data: result.base64_data,
				original_size_kb: result.original_size_kb,
				final_size_kb: result.final_size_kb,
				resized: result.resized,
				format: result.format,
				scale_factor: result.scale_factor,
				new_dimensions: result.new_dimensions,
				warning: result.warning
			};
		} catch (error) {
			return {
				success: false,
				base64_data: "",
				original_size_kb: 0,
				final_size_kb: 0,
				resized: false,
				format: "",
				warning: `Image processing failed: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
}
