@echo off
setlocal enabledelayedexpansion

set ROOT=%~dp0..
set CONTAINER=
set ARCH=amd64
set MIRROR=mcr.microsoft.com/mirror/docker/library/
set BASE_IMAGE=
set ARGS=

:parse_args
if "%~1"=="" goto :done_parsing
if "%~1"=="--container" (
	set CONTAINER=%~2
	shift & shift
	goto :parse_args
)
if "%~1"=="--arch" (
	set ARCH=%~2
	shift & shift
	goto :parse_args
)
if "%~1"=="--base-image" (
	set BASE_IMAGE=%~2
	shift & shift
	goto :parse_args
)
set "ARGS=!ARGS! %~1"
shift
goto :parse_args

:done_parsing
if "%CONTAINER%"=="" (
	echo Error: --container is required
	exit /b 1
)

set HOST_ARCH=amd64
if "%PROCESSOR_ARCHITECTURE%"=="ARM64" set HOST_ARCH=arm64
if not "%ARCH%"=="%HOST_ARCH%" (
	echo Setting up QEMU emulation for %ARCH% on %HOST_ARCH% host
	docker run --privileged --rm tonistiigi/binfmt --install all >nul 2>&1
)

set BASE_IMAGE_ARG=
if not "%BASE_IMAGE%"=="" set BASE_IMAGE_ARG=--build-arg "BASE_IMAGE=%BASE_IMAGE%"

echo Building container image: %CONTAINER%
docker buildx build ^
	--platform "linux/%ARCH%" ^
	--build-arg "MIRROR=%MIRROR%" ^
	%BASE_IMAGE_ARG% ^
	--tag "%CONTAINER%" ^
	--file "%ROOT%\containers\%CONTAINER%.dockerfile" ^
	"%ROOT%\containers"

echo Running sanity tests in container
docker run ^
	--rm ^
	--platform "linux/%ARCH%" ^
	--volume "%ROOT%:/root" ^
	--entrypoint sh ^
	"%CONTAINER%" ^
	/root/containers/entrypoint.sh %ARGS%
