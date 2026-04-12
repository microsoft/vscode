/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var RectangleRendererBindingId;
(function (RectangleRendererBindingId) {
    RectangleRendererBindingId[RectangleRendererBindingId["Shapes"] = 0] = "Shapes";
    RectangleRendererBindingId[RectangleRendererBindingId["LayoutInfoUniform"] = 1] = "LayoutInfoUniform";
    RectangleRendererBindingId[RectangleRendererBindingId["ScrollOffset"] = 2] = "ScrollOffset";
})(RectangleRendererBindingId || (RectangleRendererBindingId = {}));
export const rectangleRendererWgsl = /*wgsl*/ `

struct Vertex {
	@location(0) position: vec2f,
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f,
}

struct Shape {
	position: vec2f,
	size: vec2f,
	color: vec4f,
};

struct VSOutput {
	@builtin(position) position: vec4f,
	@location(1)       color:    vec4f,
};

// Uniforms
@group(0) @binding(${1 /* RectangleRendererBindingId.LayoutInfoUniform */}) var<uniform>       layoutInfo:      LayoutInfo;

// Storage buffers
@group(0) @binding(${0 /* RectangleRendererBindingId.Shapes */})            var<storage, read> shapes:          array<Shape>;
@group(0) @binding(${2 /* RectangleRendererBindingId.ScrollOffset */})      var<uniform>       scrollOffset:    ScrollOffset;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let shape = shapes[instanceIndex];

	var vsOut: VSOutput;
	vsOut.position = vec4f(
		(
			// Top left corner
			vec2f(-1,  1) +
			// Convert pixel position to clipspace
			vec2f( 2, -2) / layoutInfo.canvasDims *
			// Shape position and size
			(layoutInfo.viewportOffset - scrollOffset.offset + shape.position + vert.position * shape.size)
		),
		0.0,
		1.0
	);
	vsOut.color = shape.color;
	return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return vsOut.color;
}
`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjdGFuZ2xlUmVuZGVyZXIud2dzbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2dwdS9yZWN0YW5nbGVSZW5kZXJlci53Z3NsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sQ0FBTixJQUFrQiwwQkFJakI7QUFKRCxXQUFrQiwwQkFBMEI7SUFDM0MsK0VBQU0sQ0FBQTtJQUNOLHFHQUFpQixDQUFBO0lBQ2pCLDJGQUFZLENBQUE7QUFDYixDQUFDLEVBSmlCLDBCQUEwQixLQUExQiwwQkFBMEIsUUFJM0M7QUFFRCxNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxRQUFRLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7cUJBNEJ6QixvREFBNEM7OztxQkFHNUMseUNBQWlDO3FCQUNqQywrQ0FBdUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBNkIzRCxDQUFDIn0=