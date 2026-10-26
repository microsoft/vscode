/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real 3x2 images produced by an image encoder (Pillow), one per supported format, so the
 * tests exercise genuine encoder output rather than hand-picked signature bytes.
 */
export const realImages: Readonly<Record<string, Uint8Array>> = {
	'image/png': fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4nGM8IRfFAAZMEIqBgQEAFyoBRBTo4xQAAAAASUVORK5CYII='),
	'image/jpeg': fromBase64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDl6KKKZ+jn/9k='),
	'image/gif': fromBase64('R0lGODdhAwACAIEAAMgeWgAAAAAAAAAAACwAAAAAAwACAAAIBgABCBwYEAA7'),
	'image/webp': fromBase64('UklGRjQAAABXRUJQVlA4ICgAAABQAQCdASoDAAIAAUAmJaAABDOAAP7wmyP//ucD//ZwP/9nA/iQAAAA'),
	'image/bmp': fromBase64('Qk1OAAAAAAAAADYAAAAoAAAAAwAAAAIAAAABABgAAAAAABgAAADEDgAAxA4AAAAAAAAAAAAAWh7IWh7IWh7IAAAAWh7IWh7IWh7IAAAA'),
};

/** Real files in formats that are not supported images, including ones that share a container with one. */
export const nonImages: Readonly<Record<string, Uint8Array>> = {
	'empty': new Uint8Array(),
	'zero-filled': new Uint8Array(1024),
	'text': new TextEncoder().encode('this is not an image'),
	'text starting with BM': new TextEncoder().encode('BMW is a car manufacturer'),
	'wav (RIFF container)': fromBase64('UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAACAgA=='),
	'pdf': new TextEncoder().encode('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'),
	'zip': fromBase64('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=='),
};

function fromBase64(value: string): Uint8Array {
	return new Uint8Array(Buffer.from(value, 'base64'));
}
