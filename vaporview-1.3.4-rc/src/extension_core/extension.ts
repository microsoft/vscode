// Description: This file contains the extension logic for the VaporView extension
import * as vscode from 'vscode';

import { TimestampLinkProvider, NetlistLinkProvider } from './terminal_links';
import { WaveformViewerProvider } from './viewer_provider';

const wasmDebug   = 'debug';
const wasmRelease = 'release';
const wasmBuild   = wasmRelease;

// #region activate()
export async function activate(context: vscode.ExtensionContext) {

  // Load the Wasm module
  const binaryFile = vscode.Uri.joinPath(context.extensionUri, 'target', 'wasm32-unknown-unknown', wasmBuild, 'filehandler.wasm');
  const binaryData = await vscode.workspace.fs.readFile(binaryFile);
  const wasmModule = await WebAssembly.compile(binaryData);

  // Register Custom Editor Provider (The viewer window)
  // See package.json for more details
  const viewerProvider = new WaveformViewerProvider(context, wasmModule);

  vscode.window.registerCustomEditorProvider(
    'vaporview.waveformViewer',
    viewerProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    });

  vscode.window.registerTerminalLinkProvider(new TimestampLinkProvider(viewerProvider));

  // I want to get semantic tokens for the current theme
  // The API is not available yet, so I'm just going to log the theme
  vscode.window.onDidChangeActiveColorTheme((e) => {viewerProvider.updateColorTheme(e);});
  vscode.workspace.onDidChangeConfiguration((e) => {viewerProvider.updateConfiguration(e);});

  // #region External Commands
  context.subscriptions.push(vscode.commands.registerCommand('vaporview.openFile', (uri) => {
    viewerProvider.log.appendLine("Command called: 'vaporview.openFile ' + " + uri.toString());
    vscode.commands.executeCommand('vscode.openWith', uri, 'vaporview.waveformViewer');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.addVariable', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.addVariable' " + JSON.stringify(e));
    viewerProvider.variableActionCommandHandler(e, "add");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.removeVariable', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.removeVariable' " + JSON.stringify(e));
    viewerProvider.variableActionCommandHandler(e, "remove");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.revealInNetlistView', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.revealInNetlistView' " + JSON.stringify(e));
    viewerProvider.variableActionCommandHandler(e, "reveal");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.addSignalValueLink', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.addSignalValueLink' " + JSON.stringify(e));
    viewerProvider.variableActionCommandHandler(e, "addLink");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.setMarker', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.setMarker' " + JSON.stringify(e));
    viewerProvider.markerCommandHandler(e);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.getOpenDocuments', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.getOpenDocuments' " + JSON.stringify(e));
    return viewerProvider.getAllDocuments();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.getViewerSettings', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.getViewerSettings' " + JSON.stringify(e));
    const document = viewerProvider.getDocumentFromOptionalUri(e.uri);
    if (!document) {return;}
    return document.getSettings();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('waveformViewer.getValuesAtTime', (e) => {
    viewerProvider.log.appendLine("Command called: 'waveformViewer.getValuesAtTime' " + JSON.stringify(e));
    const document = viewerProvider.getDocumentFromOptionalUri(e.uri);
    if (!document) {return;}
    return document.getValuesAtTime(e);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.viewVaporViewSidebar', () => {
    vscode.commands.executeCommand('workbench.view.extension.vaporView');
  }));

  // Add or remove signal commands
  context.subscriptions.push(vscode.commands.registerCommand('vaporview.addVariableByInstancePath', (e) => {
    viewerProvider.addVariableByInstancePathToDocument(e);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.removeSignal', (e) => {
    if (e.netlistId !== undefined) {
      viewerProvider.removeSignalFromDocument(e.netlistId);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.addSelected', (e) => {
    viewerProvider.filterAddSignalsInNetlist(viewerProvider.netlistViewSelectedSignals, false);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.addAllInScopeShallow', (e) => {
    viewerProvider.addAllInScopeToDocument(e, false, 128);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.addAllInScopeRecursive', (e) => {
    viewerProvider.addAllInScopeToDocument(e, true, 128);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.removeSelectedNetlist', (e) => {
    viewerProvider.removeSelectedSignalsFromDocument('netlist');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.removeSelectedDisplayedSignals', (e) => {
    viewerProvider.removeSelectedSignalsFromDocument('displayedSignals');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.removeAllInScope', (e) => {
    if (e.collapsibleState === vscode.TreeItemCollapsibleState.None) {return;}
    viewerProvider.removeSignalList(e.children);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.showInNetlistView', (e) => {
    if (e.netlistId !== undefined) {
      viewerProvider.showInNetlistView(e.netlistId);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.showInViewer', (e) => {
    viewerProvider.addSignalByNameToDocument(e.modulePath + '.' + e.name);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.copyName', (e) => {
    let result = "";
    if (e.modulePath !== "") {result += e.modulePath + ".";}
    if (e.name) {result += e.name;}
    if (e.signalName) {result += e.signalName;}
    vscode.env.clipboard.writeText(result);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.copyValueAtMarker', (e) => {
    viewerProvider.copyValueAtMarker(e);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.saveViewerSettings', (e) => {
    viewerProvider.saveSettingsToFile();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.loadViewerSettings', (e) => {
    viewerProvider.loadSettingsFromFile();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.reloadFile', (e) => {
    viewerProvider.reloadFile(e);
  }));

  // #Marker and Timing
  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnits', (e) => {
    viewerProvider.updateTimeUnits("");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnitsSeconds', (e) => {
    viewerProvider.updateTimeUnits("s");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnitsMilliseconds', (e) => {
    viewerProvider.updateTimeUnits("ms");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnitsMicroseconds', (e) => {
    viewerProvider.updateTimeUnits("µs");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnitsNanoseconds', (e) => {
    viewerProvider.updateTimeUnits("ns");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnitsPicoseconds', (e) => {
    viewerProvider.updateTimeUnits("ps");
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setTimeUnitsFemtoseconds', (e) => {
    viewerProvider.updateTimeUnits("fs");
  }));

  // #region WaveDrom
  context.subscriptions.push(vscode.commands.registerCommand('vaporview.copyWaveDrom', (e) => {
    viewerProvider.copyWaveDrom();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setWaveDromClockRising', (e) => {
    viewerProvider.setWaveDromClock('1', e.netlistId);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.setWaveDromClockFalling', (e) => {
    viewerProvider.setWaveDromClock('0', e.netlistId);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.unsetWaveDromClock', (e) => {
    viewerProvider.setWaveDromClock('1', null);
  }));

  // #region Value Format
  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsBinary', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {valueFormat: "binary"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsHexadecimal', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {valueFormat: "hexadecimal"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsDecimal', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {valueFormat: "decimal"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsDecimalSigned', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {valueFormat: "signed"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsOctal', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {valueFormat: "octal"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsFloat', (e) => {
    switch (e.width) {
      case 8:  viewerProvider.setValueFormat(e.netlistId, {valueFormat: "float8"}); break;
      case 16: viewerProvider.setValueFormat(e.netlistId, {valueFormat: "float16"}); break;
      case 32: viewerProvider.setValueFormat(e.netlistId, {valueFormat: "float32"}); break;
      case 64: viewerProvider.setValueFormat(e.netlistId, {valueFormat: "float64"}); break;
      default: viewerProvider.setValueFormat(e.netlistId, {valueFormat: "binary"}); break;
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.renderMultiBit', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {renderType: "multiBit"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.renderLinear', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {renderType: "linear"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.renderStepped', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {renderType: "stepped"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.renderLinearSigned', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {renderType: "linearSigned"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.renderSteppedSigned', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {renderType: "steppedSigned"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsBFloat', (e) => {
    viewerProvider.setValueFormat(e.netlistId,  {valueFormat: "bfloat16"});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.displayAsTFloat', (e) => {
    viewerProvider.setValueFormat(e.netlistId,  {valueFormat: "tensorfloat32"});
  }));

  // #region Custom Color
  context.subscriptions.push(vscode.commands.registerCommand('vaporview.defaultColor1', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 0});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.defaultColor2', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 1});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.defaultColor3', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 2});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.defaultColor4', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 3});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.customColor1', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 4});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.customColor2', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 5});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.customColor3', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 6});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.customColor4', (e) => {
    viewerProvider.setValueFormat(e.netlistId, {colorIndex: 7});
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.showRulerLines', (e) => {
    vscode.workspace.getConfiguration('vaporview').update('showRulerLines', true, vscode.ConfigurationTarget.Global);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.hideRulerLines', (e) => {
    vscode.workspace.getConfiguration('vaporview').update('showRulerLines', false, vscode.ConfigurationTarget.Global);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('vaporview.dummy', (e) => {
    viewerProvider.log.appendLine("Command called: 'vaporview.dummy' " + JSON.stringify(e));
  }
  ));
}

export default WaveformViewerProvider;

export function deactivate() {}
