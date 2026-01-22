set ROOT=%~dp0..
set CONTAINER=%1
set PLATFORM=linux/arm64
set QUALITY=insider
set COMMIT=f60f946b1736ae6f26b944f8f5b6ce6270d05405

docker buildx build ^
	--tag %CONTAINER% ^
	--file %ROOT%\containers\%CONTAINER%.dockerfile ^
	%ROOT%\containers

docker run ^
	--rm ^
	--volume %ROOT%:/root ^
	%CONTAINER% ^
	--quality %QUALITY% ^
	--commit %COMMIT% ^
	--verbose
