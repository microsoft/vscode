import * as vscode from 'vscode';
import { WaveformViewerProvider, VaporviewDocumentDelegate } from './viewer_provider';


interface CustomTerminalLink extends vscode.TerminalLink {data: string; type: string;}
export class TimestampLinkProvider implements vscode.TerminalLinkProvider {

  // Terminal link provider code
  // Detect UVM timestamps - ie: @ 1234
  private readonly uvmTimestampRegex  = /@\s+(\d+)/g;
  // Detect timestamps with units - ie: 1.234 ns
  private readonly timeStampWithUnits = /([\d,\.]+)\s*([kmµunpf]?s)/g;

  constructor(private readonly viewerProvider: WaveformViewerProvider) {}

  provideTerminalLinks(context: vscode.TerminalLinkContext, token: vscode.CancellationToken) {

    const uvmTimestampMatches       = [...context.line.matchAll(this.uvmTimestampRegex)];
    const timeStampWithUnitsMatches = [...context.line.matchAll(this.timeStampWithUnits)];

    const uvmTimestampLinks = uvmTimestampMatches.map(match => {
      const line       = context.line;
      const startIndex = line.indexOf(match[0]);

      return {
        startIndex,
        length: match[0].length,
        tooltip: 'Go to time: ' + match[1] + ' in waveform viewer',
        data: match[0],
        type: 'uvm-timestamp'
      } as CustomTerminalLink;
    });

    const timeStampWithUnitsLinks = timeStampWithUnitsMatches.map(match => {
      const line       = context.line;
      const startIndex = line.indexOf(match[0]);

      return {
        startIndex,
        length: match[0].length,
        tooltip: 'Go to ' + match[1] + ' ' + match[2] + ' in waveform viewer',
        data: match[0],
        type: 'timestamp-with-units'
      } as CustomTerminalLink;
    });

    return [...uvmTimestampLinks, ...timeStampWithUnitsLinks];
  }

  handleTerminalLink(link: CustomTerminalLink) {

    switch (link.type) {
      case 'uvm-timestamp': {
        const time = parseInt([...link.data.matchAll(this.uvmTimestampRegex)][0][1]);
        this.viewerProvider.log.appendLine('UVM Timestamp link clicked: ' + time);
        this.viewerProvider.setMarkerAtTime(time, 0);
        break;
      }
      case 'timestamp-with-units': {
        const timeString = [...link.data.matchAll(this.timeStampWithUnits)][0][1];
        const time       = parseFloat(timeString.replace(/,/g, ''));
        const units      = [...link.data.matchAll(this.timeStampWithUnits)][0][2];
        this.viewerProvider.log.appendLine("Timestamp with units link clicked: " + time + '; units: ' + units);
        this.viewerProvider.setMarkerAtTimeWithUnits(time, units, 0);
        break;
      }
    }
  }
}

export class NetlistLinkProvider implements vscode.TerminalLinkProvider {

  // Terminal link provider code
  // Detect netlist elements in the terminal - ie: top.submodule.signal
  private readonly defaultRegex     = /(([\w\$\.\[\]\:]+)\.)+[\w\$\.\[\]\:]+/g;
  private readonly regexList: RegExp[] = [];

  // We only want to match to valid top level modules (which will be passed in)
  // and not to any random string that looks like a netlist element
  constructor(
    private delegate: VaporviewDocumentDelegate,
    scopeTop: string[]
  ) {
    if (scopeTop.length > 16) {
      this.regexList.push(this.defaultRegex);
    } else {
      for (const scope of scopeTop) {
        // Escape all special regex characters: $ * + ? ( ) [ ]
        const escapedScope = scope.replace(/[$*+?()[\]]/g, '\\$&');
        const regex = new RegExp(escapedScope + '(\\.[\\w\\$\\[\\]\\:]+)+', 'g');
        this.regexList.push(regex);
      }
    }
  }

  provideTerminalLinks(context: vscode.TerminalLinkContext, token: vscode.CancellationToken) {

    const netlistElementMatches: RegExpMatchArray[] = [];
    for (const regex of this.regexList) {
      const matches = [...context.line.matchAll(regex)];
      netlistElementMatches.push(...matches);
    }

    const netlistElementLinks = netlistElementMatches.map(match => {
      const line       = context.line;
      const startIndex = line.indexOf(match[0]);

      return {
        startIndex,
        length: match[0].length,
        tooltip: 'Add "' + match[0] + '" to waveform viewer',
        data: match[0],
        type: 'netlist-element'
      } as CustomTerminalLink;
    });

    return [...netlistElementLinks];
  }

  handleTerminalLink(link: CustomTerminalLink) {
    //console.log("Netlist element link clicked: " + link.data);
    this.delegate.addSignalByNameToDocument(link.data);
    this.delegate.logOutputChannel('Terminal link clicked: ' + link.data);
  }
}