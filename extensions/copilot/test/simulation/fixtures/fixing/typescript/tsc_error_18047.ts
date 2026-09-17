export const getStringSize = (function (): void {
	let measurementSpan = document.getElementById('container');
	const measurementSpanStyle: Record<string, any> = {};
		Object.keys(measurementSpanStyle).map(styleKey => {
			(measurementSpan.style as Record<string, any>)[styleKey] = measurementSpanStyle[styleKey];
			return styleKey;
		});
});
