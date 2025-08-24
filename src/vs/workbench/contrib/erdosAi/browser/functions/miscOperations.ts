/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionCallArgs, FunctionResult, CallContext } from './types.js';
import { BaseFunctionHandler } from './baseFunctionHandler.js';
// Diff utilities removed with search replace functionality

/**
 */
export interface ViewImageArgs extends FunctionCallArgs {
	image_path: string;
}

/**
 * Handler for view_image function calls
 * This is a NON-INTERACTIVE function that processes images and creates conversation entries
 */
export class ImageHandler extends BaseFunctionHandler {
	async execute(args: ViewImageArgs, context: CallContext): Promise<FunctionResult> {
		const image_path = args.image_path;

		let processedImagePath = image_path;
		if (image_path) {
			processedImagePath = await this.fixImagePath(image_path, context);
		}

		let file_exists = await this.fileExists(processedImagePath, context);
		let function_response: string;

		if (file_exists) {
			const validationResult = await this.validateImageFile(processedImagePath, context);
			if (validationResult.isValid) {
				function_response = validationResult.message;
			} else {
				function_response = validationResult.message;
				file_exists = false;
			}
		} else {
			function_response = `Error: Image not found: ${processedImagePath}`;
		}

		const function_output_id = context.conversationManager.getPreallocatedMessageId(args.call_id || '', 2);
		if (function_output_id === null) {
			throw new Error(`Pre-allocated message ID not found for call_id: ${args.call_id} index: 2`);
		}

		const function_call_output = {
			id: function_output_id,
			type: 'function_call_output' as const,
			call_id: args.call_id || '',
			output: function_response,
			related_to: context.functionCallMessageId || context.relatedToId // Point to function call message ID, not user message ID
		};

		let image_message_entry = null;
		let image_msg_id = null;

		if (file_exists) {
			const resize_result = await this.resizeImageForAI(processedImagePath, 100, context);

			const image_b64 = resize_result.base64_data;

			let mime_type: string;
			if (resize_result.format) {
				mime_type = this.getMimeTypeFromFormat(resize_result.format);
			} else {
				mime_type = this.getMimeTypeFromExtension(processedImagePath, context);
			}

			if (resize_result.resized) {
				function_response = `Success: Image resized from ${resize_result.original_size_kb}KB to ${resize_result.final_size_kb}KB (${this.getBasename(processedImagePath)})`;
				if (resize_result.new_dimensions) {
					function_response += ` - resized to ${resize_result.new_dimensions}`;
				}
			} else {
				function_response = `Success: Image loaded at ${resize_result.final_size_kb}KB (${this.getBasename(processedImagePath)})`;
			}

			if (resize_result.warning) {
				function_response += ` - Warning: ${resize_result.warning}`;
			}

			const image_data = `data:${mime_type};base64,${image_b64}`;

			image_msg_id = context.conversationManager.getNextMessageId();

			const image_content = [
				{ type: "input_text", text: `Image: ${this.getBasename(processedImagePath)}` },
				{ type: "input_image", image_url: image_data }
			];

			image_message_entry = {
				id: image_msg_id,
				role: "user" as const,
				content: image_content,
				related_to: function_output_id
			};

			// Update function call output with final response
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

	/**
	 * Fix image path to handle duplication issues
	 */
	private async fixImagePath(image_path: string, context: CallContext): Promise<string> {
		const current_wd = await this.getCurrentWorkingDirectory(context);

		if (!image_path.startsWith("/") && !this.isWindowsAbsolutePath(image_path)) {
			// Path appears relative, but check if it's actually an absolute path missing the leading /
			if (this.looksLikeAbsolutePathMissingSlash(image_path)) {
				// This looks like an absolute path missing the leading slash
				image_path = "/" + image_path;
			} else {
				// Treat as genuinely relative path
				image_path = this.joinPath(current_wd, image_path);
			}
		}

		const path_components = image_path.split("/").filter(comp => comp !== "");

		if (path_components.length > 2) {
			// Check for any directory that appears twice in a row with intervening path
			for (let i = 0; i < path_components.length - 1; i++) {
				const dir_name = path_components[i];
				if (dir_name.length > 0) {
					// Look for this directory name appearing again later in the path
					const later_slice = path_components.slice(i + 1);
					const later_matches = later_slice.findIndex(comp => comp === dir_name);
					if (later_matches !== -1) {
						// Found duplication - take everything from the second occurrence
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
				// Multiple occurrences found - use the last one and take everything from there
				const last_wd_pos = wd_positions[wd_positions.length - 1];
				let remaining_path = image_path.substring(last_wd_pos + current_wd.length);
				if (remaining_path.startsWith("/")) {
					remaining_path = remaining_path.substring(1);
				}
				if (remaining_path.length > 0) {
					image_path = this.joinPath(current_wd, remaining_path);
				}
			}
		}

		return image_path;
	}

	/**
	 * Validate image file
	 */
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
		const max_size = 10 * 1024 * 1024; // 10MB
		if (file_size > max_size) {
			return {
				isValid: false,
				message: `Error: Image file too large (${Math.round(file_size / 1024 / 1024 * 10) / 10}MB). Maximum size is 10MB: ${this.getBasename(image_path)}`
			};
		}

		const file_ext = context.fileSystemUtils.getFileExtension(image_path).toLowerCase();
		const supported_formats = ["png", "jpg", "jpeg", "gif", "svg", "bmp", "tiff", "webp"];
		if (!supported_formats.includes(file_ext)) {
			return {
				isValid: false,
				message: `Error: Unsupported image format '.${file_ext}'. Supported formats: ${supported_formats.join(", ")}`
			};
		}

		return {
			isValid: true,
			message: `Success: Image found at ${this.getBasename(image_path)} (${Math.round(file_size / 1024 * 10) / 10}KB)`
		};
	}

	/**
	 * Resize image for AI processing using real ImageProcessingManager
	 */
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

	/**
	 * Get MIME type from format string
	 */
	private getMimeTypeFromFormat(format: string): string {
		switch (format.toUpperCase()) {
			case "PNG":
				return "image/png";
			case "JPEG":
			case "JPG":
				return "image/jpeg";
			default:
				return "image/png"; // default fallback
		}
	}

	/**
	 * Get MIME type from file extension
	 */
	private getMimeTypeFromExtension(image_path: string, context: CallContext): string {
		const file_ext = context.fileSystemUtils.getFileExtension(image_path).toLowerCase();
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
				return "image/png"; // default fallback
		}
	}

	// Helper methods (using real file system operations)

	private isWindowsAbsolutePath(path: string): boolean {
		return /^[A-Za-z]:/.test(path);
	}

	private looksLikeAbsolutePathMissingSlash(path: string): boolean {
		return path.startsWith("Users/") || path.startsWith("home/") || 
			   path.startsWith("opt/") || path.startsWith("var/") ||
			   path.startsWith("tmp/") || path.startsWith("usr/");
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


}
