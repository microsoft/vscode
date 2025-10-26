/**
 * Generate a deterministic color for a user ID
 */
export function getColorForUser(userId: string): string {
	// Hash the user ID to a number
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = userId.charCodeAt(i) + ((hash << 5) - hash);
	}

	// Convert to HSL color (varied hue, consistent saturation/lightness)
	const hue = Math.abs(hash) % 360;
	const saturation = 70;
	const lightness = 50;

	return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Predefined color palette for better visual distinction
 */
const COLOR_PALETTE = [
	'#5ea9ff', // Blue (accent-1)
	'#79d6c3', // Teal (accent-2)
	'#ff6b6b', // Red
	'#f59e0b', // Amber
	'#8b5cf6', // Purple
	'#ec4899', // Pink
	'#10b981', // Green
	'#f97316', // Orange
];

let colorIndex = 0;

/**
 * Get next color from palette (round-robin)
 */
export function getNextPaletteColor(): string {
	const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
	colorIndex++;
	return color;
}
