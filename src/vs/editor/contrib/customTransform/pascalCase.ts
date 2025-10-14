// Converts an UPPER_CASE string to PascalCase
// Examples: FOO_BAR -> FooBar, HTML_API -> HtmlApi
export function toPascalCase(text: string): string {
    // Split by underscores and remove empty segments
    const segments = text.split('_').filter(Boolean);

    // Capitalize each segment
    const capitalized = segments.map(seg => {
        return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
    });

    // Join segments into a single PascalCase string
    return capitalized.join('');
}
