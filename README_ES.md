# Visual Studio Code - Open Source ("Code - OSS")
[![Build Status](https://dev.azure.com/vscode/VSCode/_apis/build/status/VS%20Code?branchName=master)](https://aka.ms/vscode-builds)
[![Feature Requests](https://img.shields.io/github/issues/microsoft/vscode/feature-request.svg)](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
[![Bugs](https://img.shields.io/github/issues/microsoft/vscode/bug.svg)](https://github.com/microsoft/vscode/issues?utf8=✓&q=is%3Aissue+is%3Aopen+label%3Abug)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-yellow.svg)](https://gitter.im/Microsoft/vscode)

## The Repository

Este repositorio ("`Code - OSS`") es donde nosotros (Microsoft) desarrollamos [Visual Studio Code](https://code.visualstudio.com). Aquí no solo trabajamos en código y problemas, también publicamos nuestros [roadmap](https://github.com/microsoft/vscode/wiki/Roadmap), [planes de iteración mensuales](https://github.com/microsoft/vscode/wiki/Iteration-Plans), Y nuestro [planes finales](https://github.com/microsoft/vscode/wiki/Running-the-Endgame). Este código fuente está disponible para todos bajo el estándar de [MIT license](https://github.com/microsoft/vscode/blob/master/LICENSE.txt).

## Visual Studio Code

<p align="center">
  <img alt="VS Code in action" src="https://user-images.githubusercontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">
</p>

[Visual Studio Code](https://code.visualstudio.com) es una distribución de la `Code - OSS` repositorio con personalizaciones específicas de Microsoft lanzadas bajo un [Licencia de producto de Microsoft](https://code.visualstudio.com/License/).

[Visual Studio Code](https://code.visualstudio.com) combina la simplicidad de un editor de código con lo que los desarrolladores necesitan para su ciclo principal de edición, compilación y depuración. Proporciona soporte completo de edición, navegación y comprensión de código junto con depuración liviana, un modelo de extensibilidad enriquecido e integración liviana con herramientas existentes.

Visual Studio Code se actualiza mensualmente con nuevas funciones y correcciones de errores. Puede descargarlo para Windows, macOS y Linux en [Sitio web de Visual Studio Code](https://code.visualstudio.com/Download). Para obtener las últimas versiones todos los días, instale [Insiders build](https://code.visualstudio.com/insiders).

## Contribuyendo

Hay muchas formas en las que puede participar en el proyecto, por ejemplo:

* [Envíe solicitudes para arreglar errores y funciones](https://github.com/microsoft/vscode/issues), y ayúdanos a verificarlos a medida que se registran
* Revisando [los cambios en el código fuente](https://github.com/microsoft/vscode/pulls)
* Revisando la [documentación](https://github.com/microsoft/vscode-docs) y realizar solicitudes de extracción para cualquier cosa, desde errores tipográficos hasta contenido nuevo

Si está interesado en solucionar problemas y contribuir directamente a la base del código,
por favor vea el documento [Cómo contribuir](https://github.com/microsoft/vscode/wiki/How-to-Contribute), que cubre lo siguiente:

* [Como compilar y ejecutar desde el código fuente](https://github.com/microsoft/vscode/wiki/How-to-Contribute#build-and-run)
* [El flujo de trabajo de desarrollo, incluida la depuración y la ejecución de pruebas.](https://github.com/microsoft/vscode/wiki/How-to-Contribute#debugging)
* [Directrices de codificación](https://github.com/microsoft/vscode/wiki/Coding-Guidelines)
* [Enviar solicitudes de extracción](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests)
* [Finding an issue to work on](https://github.com/microsoft/vscode/wiki/How-to-Contribute#where-to-contribute)
* [Contribuir a las traducciones](https://aka.ms/vscodeloc)

## Realimentación

* Haz una pregunta en [Stack Overflow](https://stackoverflow.com/questions/tagged/vscode)
* [Solicita una nueva característica](CONTRIBUTING.md)
* Votar a favor a [solicitudes de funciones populares](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc)
* [Presentar un problema](https://github.com/microsoft/vscode/issues)
* Sigue a [@code](https://twitter.com/code) y Háganos saber lo que piensa!

## Proyectos relacionados

Muchos de los componentes principales y extensiones de VS Code se encuentran en sus propios repositorios en GitHub. Por ejemplo, el ["node debug adapter"](https://github.com/microsoft/vscode-node-debug) y el ["mono debug adapter"](https://github.com/microsoft/vscode-mono-debug) tienen sus propios repositorios. Para obtener una lista completa, visite [Proyectos relacionados](https://github.com/microsoft/vscode/wiki/Related-Projects) Página en nuestra [wiki](https://github.com/microsoft/vscode/wiki).

## Extensiones incluidas

VS Code incluye un conjunto de extensiones integradas ubicadas en la carpeta de [extensiones](extensions), incluidas gramáticas y fragmentos de código para muchos lenguajes. Las extensiones que brindan soporte de lenguaje enriquecido (finalización de código, Ir a la definición) para un idioma tienen el sufijo `language-features`. Por ejemplo, el `json` la extensión proporciona coloración para `JSON` y `json-language-features` proporciona soporte de lenguaje enriquecido para `JSON`.

## Contenedor de desarrollo

Este repositorio incluye un contenedor de desarrollo de Visual Studio Code Remote - Containers / Codespaces.

- Para [Remote - Containers](https://aka.ms/vscode-remote/download/containers), use el comando **Remote-Containers: Open Repository in Container...** que crea un volumen de Docker para mejorar E/S de disco en macOS y Windows.
- Para Codespaces, instale la extensión [Visual Studio Codespaces](https://aka.ms/vscs-ext-vscode) en VS Code y use el comando **Codespaces: Create New Codespace**.

Docker / Codespace debe tener al menos **4 núcleos y 6 GB de RAM (se recomiendan 8 GB)** para ejecutar la compilación completa. Consulte el [README del contenedor de desarrollo](.Devcontainer/README.md) para obtener más información.
## Código de Conducta

Este proyecto ha adoptado el [Código de conducta de código abierto de Microsoft](https://opensource.microsoft.com/codeofconduct/). Para obtener más información, consulte las [Preguntas frecuentes sobre el código de conducta](https://opensource.microsoft.com/codeofconduct/faq/) o comuníquese con [opencode@microsoft.com](mailto: opencode@microsoft.com) si tiene preguntas adicionales o comentarios.
## Licencia

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.
