/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum RectangleRendererBindingId {
	Shapes,
	LayoutInfoUniform,
}

export const rectangleRendererWgsl = /*wgsl*/ `

struct Vertex {
	@location(0) position: vec2f,
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct Shape {
	position: vec2f,
	size: vec2f
};

// Uniforms
@group(0) @binding(${RectangleRendererBindingId.LayoutInfoUniform}) var<uniform>       layoutInfo:      LayoutInfo;

// Storage buffers
@group(0) @binding(${RectangleRendererBindingId.Shapes})            var<storage, read> shapes:          array<Shape>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {
	let shape = shapes[instanceIndex];

	return vec4f(
		(
			// Top left corner
			vec2f(-1, 1) +
			// Shape position
			(shape.position * vec2f(2, -2)) / layoutInfo.canvasDims +
			// Shape size
			((vert.position * vec2f(2, -2)) / layoutInfo.canvasDims) * shape.size
		),
		0.0,
		1.0
	);
}

@fragment fn fs() -> @location(0) vec4f {
	return vec4(1, 0, 0, 1);
}
`;
