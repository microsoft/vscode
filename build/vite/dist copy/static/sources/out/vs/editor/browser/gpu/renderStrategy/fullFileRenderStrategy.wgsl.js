/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TextureAtlas } from '../atlas/textureAtlas.js';
import { TextureAtlasPage } from '../atlas/textureAtlasPage.js';
export const fullFileRenderStrategyWgsl = /*wgsl*/ `
struct GlyphInfo {
	position: vec2f,
	size: vec2f,
	origin: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct Cell {
	position: vec2f,
	unused1: vec2f,
	glyphIndex: f32,
	textureIndex: f32
};

struct LayoutInfo {
	canvasDims: vec2f,
	viewportOffset: vec2f,
	viewportDims: vec2f,
}

struct ScrollOffset {
	offset: vec2f
}

struct VSOutput {
	@builtin(position) position:   vec4f,
	@location(1)       layerIndex: f32,
	@location(0)       texcoord:   vec2f,
};

// Uniforms
@group(0) @binding(${4 /* BindingId.LayoutInfoUniform */})       var<uniform>       layoutInfo:      LayoutInfo;
@group(0) @binding(${5 /* BindingId.AtlasDimensionsUniform */})  var<uniform>       atlasDims:       vec2f;
@group(0) @binding(${6 /* BindingId.ScrollOffset */})            var<uniform>       scrollOffset:    ScrollOffset;

// Storage buffers
@group(0) @binding(${0 /* BindingId.GlyphInfo */})               var<storage, read> glyphInfo:       array<array<GlyphInfo, ${TextureAtlasPage.maximumGlyphCount}>, ${TextureAtlas.maximumPageCount}>;
@group(0) @binding(${1 /* BindingId.Cells */})                   var<storage, read> cells:           array<Cell>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let cell = cells[instanceIndex];
	var glyph = glyphInfo[u32(cell.textureIndex)][u32(cell.glyphIndex)];

	var vsOut: VSOutput;
	// Multiple vert.position by 2,-2 to get it into clipspace which ranged from -1 to 1
	vsOut.position = vec4f(
		// Make everything relative to top left instead of center
		vec2f(-1, 1) +
		((vert.position * vec2f(2, -2)) / layoutInfo.canvasDims) * glyph.size +
		((cell.position * vec2f(2, -2)) / layoutInfo.canvasDims) +
		((glyph.origin * vec2f(2, -2)) / layoutInfo.canvasDims) +
		(((layoutInfo.viewportOffset - scrollOffset.offset * vec2(1, -1)) * 2) / layoutInfo.canvasDims),
		0.0,
		1.0
	);

	vsOut.layerIndex = cell.textureIndex;
	// Textures are flipped from natural direction on the y-axis, so flip it back
	vsOut.texcoord = vert.position;
	vsOut.texcoord = (
		// Glyph offset (0-1)
		(glyph.position / atlasDims) +
		// Glyph coordinate (0-1)
		(vsOut.texcoord * (glyph.size / atlasDims))
	);

	return vsOut;
}

@group(0) @binding(${2 /* BindingId.TextureSampler */}) var ourSampler: sampler;
@group(0) @binding(${3 /* BindingId.Texture */})        var ourTexture: texture_2d_array<f32>;

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return textureSample(ourTexture, ourSampler, vsOut.texcoord, u32(vsOut.layerIndex));
}
`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnVsbEZpbGVSZW5kZXJTdHJhdGVneS53Z3NsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvZ3B1L3JlbmRlclN0cmF0ZWd5L2Z1bGxGaWxlUmVuZGVyU3RyYXRlZ3kud2dzbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDeEQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFHaEUsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsUUFBUSxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztxQkFtQzlCLG1DQUEyQjtxQkFDM0Isd0NBQWdDO3FCQUNoQyw4QkFBc0I7OztxQkFHdEIsMkJBQW1CLDhFQUE4RSxnQkFBZ0IsQ0FBQyxpQkFBaUIsTUFBTSxZQUFZLENBQUMsZ0JBQWdCO3FCQUN0Syx1QkFBZTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O3FCQW9DZixnQ0FBd0I7cUJBQ3hCLHlCQUFpQjs7Ozs7Q0FLckMsQ0FBQyJ9