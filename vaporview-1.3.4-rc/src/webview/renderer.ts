import { NetlistData } from './vaporview';
import { Viewport } from './viewport';

export interface WaveformRenderer {
  id: string;
  draw(valueChangeChunk: any, netlistData: NetlistData, viewport: Viewport): void;
}

// This function actually creates the individual bus elements, and has can
// potentially called thousands of times during a render
function busValue(time: number, deltaTime: number, displayValue: string, viewportSpecs: any, justifydirection: string, spansChunk: boolean) {
  let textTime = displayValue.length * viewportSpecs.characterWidth * viewportSpecs.pixelTime;
  let padding  = 4 * viewportSpecs.pixelTime;
  let text = displayValue;
  let adjestedDeltaTime = deltaTime;
  let adjustedTime = time;
  let xValue;
  let center = true;

  //if (spansChunk) {
  //}

  adjustedTime = Math.max(time, viewportSpecs.timeScrollLeft);
  adjestedDeltaTime = Math.min(time + deltaTime, viewportSpecs.timeScrollRight) - adjustedTime;
  let characterWidthLimit = adjestedDeltaTime - (2 * padding);

  if (textTime > characterWidthLimit) {
    center = false;
    const charCount = Math.floor(characterWidthLimit / (viewportSpecs.characterWidth * viewportSpecs.pixelTime)) - 1;
    if (charCount < 0) {return ["", -100];}
    if (justifydirection === "right") {
      xValue = adjustedTime + adjestedDeltaTime - padding;
      text = '…' + displayValue.slice(displayValue.length - charCount);
    } else {
      xValue = adjustedTime + padding;
      text = displayValue.slice(0, charCount) + '…';
    }
  } else {
    xValue = adjustedTime + (adjestedDeltaTime / 2);
  }

  return [text, xValue, center];
}

export const multiBitWaveformRenderer: WaveformRenderer = {
  id: "multiBit",

  draw(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: Viewport) {

    const ctx            = netlistData.ctx;
    if (!ctx) {return;}

    const transitionData = valueChangeChunk.valueChanges;
    const initialState   = valueChangeChunk.initialState;
    const postState      = valueChangeChunk.postState;
    const startIndex     = valueChangeChunk.startIndex;
    const endIndex       = valueChangeChunk.endIndex;

    const signalWidth    = netlistData.signalWidth;
    const parseValue     = netlistData.valueFormat.formatString;
    const valueIs9State  = netlistData.valueFormat.is9State;
    const justifydirection = netlistData.valueFormat.rightJustify ? "right" : "left";

    let elementWidth;
    let is4State        = false;
    let value           = initialState[1];
    let time            = initialState[0];
    let xPosition       = 0;
    let yPosition       = 0;
    let points          = [[time, 0]];
    const endPoints     = [[time, 0]];
    let xzPoints: any   = [];
    //const xzValues: string[]        = [];
    let textElements: any[]    = [];
    let spansChunk      = true;
    let moveCursor      = false;
    let drawBackgroundStrokes = false;
    const minTextWidth  = 12 * viewportSpecs.pixelTime;
    const minDrawWidth  = viewportSpecs.pixelTime / viewportSpecs.pixelRatio;
    const drawColor        = netlistData.color;
    const xzColor          = viewportSpecs.xzColor;
    let parsedValue;

    for (let i = startIndex; i < endIndex; i++) {

      elementWidth = transitionData[i][0] - time;

      // If the element is too small to draw, we need to skip it
      if (elementWidth > minDrawWidth) {

        if (moveCursor) {
          points.push([time, 0]);
          endPoints.push([time, 0]);
          moveCursor = false;
        }

        is4State     = valueIs9State(value);
        xPosition    = (elementWidth / 2) + time;
        yPosition    =  elementWidth * 2;
        if (is4State) {
          xzPoints.push([[time, 0], [xPosition, yPosition], [transitionData[i][0], 0], [xPosition, -yPosition]]);
        } else {
          points.push([xPosition, yPosition]);
          endPoints.push([xPosition, -yPosition]);
        }

        // Don't even bother rendering text if the element is too small. Since 
        // there's an upper limit to the number of larger elements that will be 
        // displayed, we can spend a little more time rendering them and making them
        // readable in all cases.
        // We group the empty text elements that are too small to render together to
        // reduce the number of DOM operations
        if (elementWidth > minTextWidth) {
          if (netlistData.formatValid) {
            parsedValue = netlistData.formattedValues[i - 1];
          } else {
            parsedValue = parseValue(value, signalWidth, !is4State);
          }
          spansChunk = spansChunk || (transitionData[i][0] > viewportSpecs.timeScrollRight);
          textElements.push(busValue(time, elementWidth, parsedValue, viewportSpecs, justifydirection, spansChunk));
        }

        points.push([transitionData[i][0], 0]);
        endPoints.push([transitionData[i][0], 0]);
      } else {
        drawBackgroundStrokes = true;
        moveCursor = true;
      }

      time         = transitionData[i][0];
      value        = transitionData[i][1];
      spansChunk   = false;
    }

    elementWidth = postState[0] - time;

    if (elementWidth > minDrawWidth) {

      if (moveCursor) {
        points.push([time, 0]);
        endPoints.push([time, 0]);
        moveCursor = false;
      }

      xPosition    = (elementWidth / 2) + time;
      is4State     = valueIs9State(value);
      if (is4State) {
        xzPoints.push([[time, 0], [xPosition, elementWidth * 2], [postState[0], 0], [xPosition, -elementWidth * 2]]);
      } else {
        points.push([xPosition, elementWidth * 2]);
        points.push([postState[0], 0]);
        endPoints.push([xPosition, -elementWidth * 2]);
      }
    }

    if (elementWidth > minTextWidth) {
      if (netlistData.formatValid) {
        parsedValue = netlistData.formattedValues[endIndex - 1];
      } else {
        parsedValue = parseValue(value, signalWidth, !is4State);
      }
      textElements.push(busValue(time, elementWidth, parsedValue, viewportSpecs, justifydirection, true));
    }

    ctx.clearRect(0, 0, viewportSpecs.viewerWidth * viewportSpecs.pixelRatio, 20 * viewportSpecs.pixelRatio);
    ctx.save();
    ctx.translate(0, 10);

    // No Draw Line
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(viewportSpecs.viewerWidth, 0);
    ctx.strokeStyle = drawColor;
    ctx.stroke();

    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(viewportSpecs.viewerWidth, 0);
    ctx.strokeStyle = drawColor;
    ctx.stroke();
    ctx.moveTo(0, 0);

    // Draw diamonds
    ctx.restore();
    ctx.save();
    ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = drawColor;
    ctx.transform(viewportSpecs.zoomRatio, 0, 0, viewportSpecs.zoomRatio, 0, 0);
    //ctx.transform(1/viewportSpecs.zoomRatio, 0, 0, 1, 0, 0);
    ctx.beginPath();
    points.forEach(([x, y]) => {ctx.lineTo(x, y);});
    endPoints.reverse().forEach(([x, y]) => {ctx.lineTo(x, y);});
    ctx.fill();

    // Draw non-2-state values
    ctx.fillStyle = xzColor;
    xzPoints.forEach(set => {
      ctx.beginPath();
      ctx.moveTo(set[0][0], set[0][1]);
      ctx.lineTo(set[1][0], set[1][1]);
      ctx.lineTo(set[2][0], set[2][1]);
      ctx.lineTo(set[3][0], set[3][1]);
      ctx.fill();
    });
    ctx.restore();

    // Draw Text
    ctx.save();
    ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, 10);
    ctx.font = 'bold ' + viewportSpecs.fontStyle;
    ctx.fillStyle = viewportSpecs.backgroundColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false;
    ctx.textRendering = 'optimizeLegibility';
    textElements.forEach(([text, xValue, center], i) => {
      if (center) {
        ctx.fillText(text, xValue * viewportSpecs.zoomRatio, 1)
        if (i === netlistData.valueLinkIndex) {ctx.fillText("_".repeat(text.length), xValue * viewportSpecs.zoomRatio, 1);}
      };
    });
    ctx.textAlign = justifydirection;
    textElements.forEach(([text, xValue, center], i) => {
      if (!center) {
        ctx.fillText(text, xValue * viewportSpecs.zoomRatio, 1);
        if (i === netlistData.valueLinkIndex) {ctx.fillText("_".repeat(text.length), xValue * viewportSpecs.zoomRatio, 1);}
      }
    });

    // Render Signal Link Underline
    netlistData.valueLinkBounds = [];
    if (netlistData.valueLinkCommand !== "") {
      const leftOffset = justifydirection === "left" ? 0 : 1;
      const rightOffset = justifydirection === "left" ? -1 : 0;
      textElements.forEach(([text, xValue, center]) => {
        const x = (xValue * viewportSpecs.zoomRatio) - viewportSpecs.pseudoScrollLeft;
        const textWidth = text.length * viewportSpecs.characterWidth;
        if (!center) {
          netlistData.valueLinkBounds.push([x + (leftOffset * textWidth), x + (rightOffset * textWidth)]);
        } else {
          const centerOffset = textWidth / 2;
          netlistData.valueLinkBounds.push([x - centerOffset, x + centerOffset]);
        }
      });
    }

    ctx.restore();
  },
};

export const binaryWaveformRenderer: WaveformRenderer = {
  id: "binary",

  draw(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: Viewport) {

    const ctx            = netlistData.ctx;
    if (!ctx) {return;}
    const transitionData = valueChangeChunk.valueChanges;
    const initialState   = valueChangeChunk.initialState;
    const postState      = valueChangeChunk.postState;
    const startIndex     = valueChangeChunk.startIndex;
    const endIndex       = valueChangeChunk.endIndex;

    let initialValue       = initialState[1];
    let initialValue2state = parseInt(initialValue);
    let initialTime        = initialState[0];
    let initialTimeOrStart = Math.max(initialState[0], -10);
    const minDrawWidth  = viewportSpecs.pixelTime / viewportSpecs.pixelRatio;
    let xzPath:any         = [];
    const drawColor        = netlistData.color;
    const xzColor          = viewportSpecs.xzColor;
    const viewerWidthTime  = viewportSpecs.viewerWidthTime;
    const timeScrollLeft   = viewportSpecs.timeScrollLeft;
    const timeScrollRight  = viewportSpecs.timeScrollRight;
    const valueIs9State    = netlistData.valueFormat.is9State;

    if (valueIs9State(initialValue)) {
      initialValue2state = 0;
    }
    let accumulatedPath    = [[0, 0], [0, initialValue2state]];

    let value2state    = 0;
    // No Draw Code
    let lastDrawTime   = 0;
    let lastNoDrawTime: any = null;
    let noDrawFlag     = false;
    let noDrawPath: any     = [];
    let lastDrawValue  = initialValue2state;
    let lastnoDrawValue: any = null;

    for (let i = startIndex; i < endIndex; i++) {
      const time  = transitionData[i][0];
      const value = transitionData[i][1];

      if (time - initialTime < minDrawWidth) {
        noDrawFlag     = true;
        lastNoDrawTime = time;
        lastnoDrawValue = value;
      } else {

        if (noDrawFlag) {
          initialValue2state = parseInt(initialValue);
          if (valueIs9State(initialValue)) {initialValue2state = 0;}

          noDrawPath.push([lastDrawTime, lastNoDrawTime, 0]);
          accumulatedPath.push([lastDrawTime, 0]);
          accumulatedPath.push([lastNoDrawTime, 0]);
          accumulatedPath.push([lastNoDrawTime, initialValue2state]);
          noDrawFlag = false;
        }

        if (valueIs9State(initialValue)) {
          xzPath.push([initialTimeOrStart, time - initialTimeOrStart]);
        }

        value2state = parseInt(value);
        if (valueIs9State(value)) {value2state =  0;}

        // Draw the current transition to the main path
        accumulatedPath.push([time, initialValue2state]);
        accumulatedPath.push([time, value2state]);

        lastDrawValue      = value2state;
        lastDrawTime       = time;
        initialValue2state = value2state;
      }

      initialValue       = value;
      initialTimeOrStart = time;
      initialTime        = time;
    }

    initialValue2state = parseInt(initialValue);
    if (valueIs9State(initialValue)) {initialValue2state = 0;}

    if (postState[0] - initialTime < minDrawWidth) {

        noDrawPath.push([lastDrawTime, timeScrollRight, 1]);
        accumulatedPath.push([lastDrawTime, 0]);
        accumulatedPath.push([timeScrollRight, 0]);

    } else {

      if (noDrawFlag) {

        noDrawPath.push([lastDrawTime, lastNoDrawTime, 2]);
        accumulatedPath.push([lastDrawTime, 0]);
        accumulatedPath.push([lastNoDrawTime, 0]);
        accumulatedPath.push([lastNoDrawTime, initialValue2state]);
      }

      if (valueIs9State(initialValue))  {

        if (initialTimeOrStart >= 0) {
          xzPath.push([initialTimeOrStart, timeScrollRight]);
        } else {
          xzPath.push([initialTimeOrStart, timeScrollRight]);
        }
      }
    }

    accumulatedPath.push([timeScrollRight + (15 * viewportSpecs.pixelTime), initialValue2state]);
    accumulatedPath.push([timeScrollRight + (15 * viewportSpecs.pixelTime), 0]);

    const svgHeight  = 20;
    const waveHeight = 16;
    const waveOffset = waveHeight + (svgHeight - waveHeight) / 2;

    ctx.clearRect(0, 0, viewportSpecs.viewerWidth, svgHeight);
    ctx.save();
    ctx.strokeStyle = drawColor;
    ctx.fillStyle   = drawColor;
    ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, waveOffset + 0.5);
    ctx.transform(viewportSpecs.zoomRatio, 0, 0, -waveHeight, 0, 0);
    ctx.beginPath();
    accumulatedPath.forEach(([x, y]) => {ctx.lineTo(x, y);});
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = drawColor;
    ctx.stroke();

    // NoDraw Elements
    ctx.save();
    ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, waveOffset + 0.5);
    ctx.transform(viewportSpecs.zoomRatio, 0, 0, -waveHeight, 0, 0);
    ctx.beginPath();
    noDrawPath.forEach(([startTime, endTime]) => {
      ctx.moveTo(startTime, 0);
      ctx.lineTo(endTime, 0);
      ctx.lineTo(endTime, 1);
      ctx.lineTo(startTime, 1);
      ctx.lineTo(startTime, 0);
    });
    ctx.restore();
    ctx.strokeStyle = drawColor;
    ctx.fillStyle = drawColor;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // Non-2-state values
    ctx.save();
    ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, waveOffset + 0.5);
    ctx.transform(viewportSpecs.zoomRatio, 0, 0, -waveHeight, 0, 0);
    ctx.beginPath();
    xzPath.forEach(([startTime, EndTime]) => {
      ctx.moveTo(startTime, 0);
      ctx.lineTo(EndTime, 0);
      ctx.lineTo(EndTime, 1);
      ctx.lineTo(startTime, 1);
      ctx.lineTo(startTime, 0);
    });
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = xzColor;
    ctx.stroke();
  }
};

function createSvgWaveform(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: any, stepped: boolean, evalCoordinates: (v: string) => number) {

  const ctx            = netlistData.ctx;
  if (!ctx) {return;}

  const transitionData   = valueChangeChunk.valueChanges;
  const initialState     = valueChangeChunk.initialState;
  const postState        = valueChangeChunk.postState;
  const startIndex     = valueChangeChunk.startIndex;
  const endIndex       = valueChangeChunk.endIndex;
  const min              = valueChangeChunk.min;
  const max              = valueChangeChunk.max;
  let initialValue       = initialState[1];
  let initialValue2state = initialValue;
  let initialTime        = initialState[0];
  let initialTimeOrStart = Math.max(initialState[0], -10);
  const minDrawWidth  = viewportSpecs.pixelTime / (viewportSpecs.pixelRatio * 4);
  let xzPath: any        = [];
  const valueIs9State    = netlistData.valueFormat.is9State;

  if (valueIs9State(initialValue)) {
    initialValue2state = "0";
  }

  let accumulatedPath: any = [[0, 0]];


  accumulatedPath.push([initialTime, evalCoordinates(initialValue2state)]);

  let value2state    = "0";
  // No Draw Code
  let lastDrawTime   = 0;
  let lastNoDrawTime: any = null;
  let noDrawFlag     = false;
  let noDrawPath: any     = [];
  let lastDrawValue  = initialValue2state;
  let lastnoDrawValue: any = null;

  for (let i = startIndex; i < endIndex; i++) {
    const time  = transitionData[i][0];
    const value = transitionData[i][1];

    if (time - initialTime < minDrawWidth) {
      noDrawFlag     = true;
      lastNoDrawTime = time;
      lastnoDrawValue = value;
    } else {

      if (noDrawFlag) {
        initialValue2state = initialValue;
        if (valueIs9State(initialValue)) {initialValue2state = 0;}

        noDrawPath.push([lastDrawTime, lastNoDrawTime]);
        accumulatedPath.push([lastDrawTime, 0]);
        accumulatedPath.push([lastNoDrawTime, 0]);
        accumulatedPath.push([lastNoDrawTime, evalCoordinates(initialValue2state)]);
        noDrawFlag = false;
      }

      if (valueIs9State(initialValue)) {
        xzPath.push([initialTimeOrStart, time]);
      }

      value2state = value;
      if (valueIs9State(value)) {value2state =  "0";}

      // Draw the current transition to the main path
      if (stepped) {
        accumulatedPath.push([time, evalCoordinates(initialValue2state)]);
      }
      accumulatedPath.push([time, evalCoordinates(value2state)]);

      lastDrawValue      = value2state;
      lastDrawTime       = time;
      initialValue2state = value2state;
    }
    initialValue       = value;
    initialTimeOrStart = time;
    initialTime        = time;
  }

  initialValue2state = initialValue;
  if (valueIs9State(initialValue)) {initialValue2state = '0';}

  if (postState[0] - initialTime < minDrawWidth) {
    noDrawPath.push([lastDrawTime, viewportSpecs.timeScrollRight]);
    accumulatedPath.push([lastDrawTime, 0]);
    accumulatedPath.push([viewportSpecs.timeScrollRight, 0]);
  } else {

    if (noDrawFlag) {
      noDrawPath.push([lastDrawTime, lastNoDrawTime]);
      accumulatedPath.push([lastDrawTime, 0]);
      accumulatedPath.push([lastNoDrawTime, 0]);
      accumulatedPath.push([lastNoDrawTime, evalCoordinates(initialValue2state)]);
    }

    if (valueIs9State(initialValue))  {
      xzPath.push([initialTimeOrStart, viewportSpecs.timeScrollRight]);
    }
  }

  if (stepped) {
    accumulatedPath.push([viewportSpecs.timeScrollRight + (15 * viewportSpecs.pixelTime), evalCoordinates(initialValue2state)]);
  }

  accumulatedPath.push([viewportSpecs.timeScrollRight + (15 * viewportSpecs.pixelTime), 0]);

  const drawColor  = netlistData.color;
  const xzColor    = viewportSpecs.xzColor;
  const svgHeight  = 20;
  const waveHeight = 16;
  const waveOffset = waveHeight + (svgHeight - waveHeight) / 2;
  const yScale     = waveHeight / (max - min);
  const translateY = 0.5 + (max / (max - min)) * waveOffset;

  ctx.clearRect(0, 0, viewportSpecs.viewerWidth, svgHeight);
  ctx.save();
  ctx.strokeStyle = drawColor;
  ctx.fillStyle   = drawColor;
  ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, translateY + 0.5);
  ctx.transform(viewportSpecs.zoomRatio, 0, 0, -yScale, 0, 0);
  ctx.beginPath();
  accumulatedPath.forEach(([x, y]) => {ctx.lineTo(x, y);});
  ctx.globalAlpha = 0.1;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = drawColor;
  ctx.stroke();

  // NoDraw Elements
  ctx.save();
  ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, translateY + 0.5);
  ctx.transform(viewportSpecs.zoomRatio, 0, 0, -yScale, 0, 0);
  ctx.beginPath();
  noDrawPath.forEach(([startTime, endTime]) => {
    ctx.moveTo(startTime, min);
    ctx.lineTo(endTime, min);
    ctx.lineTo(endTime, max);
    ctx.lineTo(startTime, max);
    ctx.lineTo(startTime, min);
  });
  ctx.restore();
  ctx.strokeStyle = drawColor;
  ctx.fillStyle = drawColor;
  ctx.lineWidth = 1;
  ctx.fill();
  ctx.stroke();

  // Non-2-state values
  ctx.save();
  ctx.translate(0.5 - viewportSpecs.pseudoScrollLeft, translateY + 0.5);
  ctx.transform(viewportSpecs.zoomRatio, 0, 0, -yScale, 0, 0);
  ctx.beginPath();
  xzPath.forEach(([startTime, EndTime]) => {
    ctx.moveTo(startTime, min);
    ctx.lineTo(EndTime, min);
    ctx.lineTo(EndTime, max);
    ctx.lineTo(startTime, max);
    ctx.lineTo(startTime, min);
  });
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = xzColor;
  ctx.stroke();
}

const evalBinary8plusSigned = (v: string) => {
  const n = parseInt(v.slice(0,8), 2) || 0;
  return n > 127 ? n - 256 : n;
};
const evalBinarySigned = (v: string) => {
  const n = parseInt(v, 2) || 0;
  return v[0] === '1' ? n - (2 ** v.length) : n;
};
const evalBinary8plus = (v: string) => {return parseInt(v.slice(0,8), 2) || 0;};
const evalBinary = (v: string) => {return parseInt(v, 2) || 0;};
const evalReal = (v: string) => {return parseFloat(v) || 0;};

function getEval(type: string, width: number, signed: boolean) {
  if (type === "Real") {return evalReal;}

  if (width > 8) {
    if (signed) {return evalBinary8plusSigned;}
    else {       return evalBinary8plus;}
  } else {
    if (signed) {return evalBinarySigned;}
    else {       return evalBinary;}
  }
}

export const linearWaveformRenderer: WaveformRenderer = {
  id: "linear",

  draw(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: any) {
    const evalCoordinates = getEval(valueChangeChunk.encoding, netlistData.signalWidth, false);
    return createSvgWaveform(valueChangeChunk, netlistData, viewportSpecs, false, evalCoordinates);
  }
};

export const signedLinearWaveformRenderer: WaveformRenderer = {
  id: "linearSigned",

  draw(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: any) {
    const evalCoordinates = getEval(valueChangeChunk.encoding, netlistData.signalWidth, true);
    return createSvgWaveform(valueChangeChunk, netlistData, viewportSpecs, false, evalCoordinates);
  }
};

export const steppedrWaveformRenderer: WaveformRenderer = {
  id: "stepped",

  draw(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: any) {
    const evalCoordinates = getEval(valueChangeChunk.encoding, netlistData.signalWidth, false);
    return createSvgWaveform(valueChangeChunk, netlistData, viewportSpecs, true, evalCoordinates);
  }
};

export const signedSteppedrWaveformRenderer: WaveformRenderer = {
  id: "steppedSigned",

  draw(valueChangeChunk: any, netlistData: NetlistData, viewportSpecs: any) {
    const evalCoordinates = getEval(valueChangeChunk.encoding, netlistData.signalWidth, true);
    return createSvgWaveform(valueChangeChunk, netlistData, viewportSpecs, true, evalCoordinates);
  }
};