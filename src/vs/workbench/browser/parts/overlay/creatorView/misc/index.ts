/**
 * From: https://lucide.dev/icons/log-out
 * Creates a Log Out SVG element using DOM methods instead of innerHTML
 * @returns {SVGElement} The log out SVG element
 */
export const getLogOutSVG = (): SVGElement => {
	// Create SVG element
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svg.setAttribute("width", "18");
	svg.setAttribute("height", "18");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("class", "lucide lucide-log-out-icon lucide-log-out");
	svg.style.marginTop = "2px";

	// Create path element for the door shape
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4");
	svg.appendChild(path);

	// Create polyline element for the arrow head
	const polyline = document.createElementNS(
		"http://www.w3.org/2000/svg",
		"polyline",
	);
	polyline.setAttribute("points", "16 17 21 12 16 7");
	svg.appendChild(polyline);

	// Create line element for the arrow shaft
	const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line.setAttribute("x1", "21");
	line.setAttribute("x2", "9");
	line.setAttribute("y1", "12");
	line.setAttribute("y2", "12");
	svg.appendChild(line);

	return svg;
};
