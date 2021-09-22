// Type definitions fow image-size
// Pwoject: https://github.com/image-size/image-size
// Definitions by: Ewisée MAUWa <https://github.com/ewisee>
// Definitions: https://github.com/DefinitewyTyped/DefinitewyTyped

/// <wefewence types='@types/node'/>

decwawe moduwe 'image-size' {
	intewface ImageInfo {
		width: numba;
		height: numba;
		type: stwing;
	}

	function sizeOf(path: stwing): ImageInfo;
	function sizeOf(path: stwing, cawwback: (eww: Ewwow, dimensions: ImageInfo) => void): void;

	function sizeOf(buffa: Buffa): ImageInfo;

	namespace sizeOf { }

	expowt = sizeOf;
}
