# Document for new users to learn how to use this technology and install dependencies

## Technologies used in VS Code and how to install dependencies

VS Code is built using a variety of technologies, including:

* **Electron:** A framework for building desktop applications using web technologies.
* **TypeScript:** A superset of JavaScript that adds static typing.
* **Node.js:** A JavaScript runtime environment.

To install dependencies for VS Code development, you will need to have Node.js installed on your system. You can download the latest version of Node.js from the official website: [https://nodejs.org/](https://nodejs.org/)

Once Node.js is installed, you can clone the VS Code repository from GitHub:

```bash
git clone https://github.com/microsoft/vscode.git
```

Then, navigate to the cloned directory and install the dependencies using npm:

```bash
cd vscode
npm install
```

### Installing Compilers and Languages

VS Code supports a wide range of programming languages and compilers through extensions. You can find and install extensions from the VS Code Marketplace within the editor itself.

To install a specific language or compiler, open VS Code and go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X). Search for the language or compiler you want to install and click the "Install" button.

Some common languages and their corresponding extensions include:

* **Python:** Python extension
* **JavaScript/TypeScript:** Built-in support, but extensions like ESLint and Prettier are recommended.
* **C++:** C/C++ extension
* **Java:** Java Extension Pack

For compilers, you may need to install them separately on your system and then configure the VS Code extension to use them. For example, for C++, you might need to install GCC or Clang.
