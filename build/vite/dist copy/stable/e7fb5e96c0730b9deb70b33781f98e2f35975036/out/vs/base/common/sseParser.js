/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var Chr;
(function (Chr) {
    Chr[Chr["CR"] = 13] = "CR";
    Chr[Chr["LF"] = 10] = "LF";
    Chr[Chr["COLON"] = 58] = "COLON";
    Chr[Chr["SPACE"] = 32] = "SPACE";
})(Chr || (Chr = {}));
/**
 * Parser for Server-Sent Events (SSE) streams.
 */
export class SSEParser {
    /**
     * Creates a new SSE parser.
     * @param onEvent The callback to invoke when an event is dispatched.
     */
    constructor(onEvent) {
        this.dataBuffer = '';
        this.eventTypeBuffer = '';
        this.buffer = [];
        this.endedOnCR = false;
        this.onEventHandler = onEvent;
        this.decoder = new TextDecoder('utf-8');
    }
    /**
     * Gets the last event ID received by this parser.
     */
    getLastEventId() {
        return this.lastEventIdBuffer;
    }
    /**
     * Gets the reconnection time in milliseconds, if one was specified by the server.
     */
    getReconnectionTime() {
        return this.reconnectionTime;
    }
    /**
     * Feeds a chunk of the SSE stream to the parser.
     * @param chunk The chunk to parse as a Uint8Array of UTF-8 encoded data.
     */
    feed(chunk) {
        if (chunk.length === 0) {
            return;
        }
        let offset = 0;
        // If the data stream was bifurcated between a CR and LF, avoid processing the CR as an extra newline
        if (this.endedOnCR && chunk[0] === 10 /* Chr.LF */) {
            offset++;
        }
        this.endedOnCR = false;
        // Process complete lines from the buffer
        while (offset < chunk.length) {
            const indexCR = chunk.indexOf(13 /* Chr.CR */, offset);
            const indexLF = chunk.indexOf(10 /* Chr.LF */, offset);
            const index = indexCR === -1 ? indexLF : (indexLF === -1 ? indexCR : Math.min(indexCR, indexLF));
            if (index === -1) {
                break;
            }
            let str = '';
            for (const buf of this.buffer) {
                str += this.decoder.decode(buf, { stream: true });
            }
            str += this.decoder.decode(chunk.subarray(offset, index));
            this.processLine(str);
            this.buffer.length = 0;
            offset = index + (chunk[index] === 13 /* Chr.CR */ && chunk[index + 1] === 10 /* Chr.LF */ ? 2 : 1);
        }
        if (offset < chunk.length) {
            this.buffer.push(chunk.subarray(offset));
        }
        else {
            this.endedOnCR = chunk[chunk.length - 1] === 13 /* Chr.CR */;
        }
    }
    /**
     * Processes a single line from the SSE stream.
     */
    processLine(line) {
        if (!line.length) {
            this.dispatchEvent();
            return;
        }
        if (line.startsWith(':')) {
            return;
        }
        // Parse the field name and value
        let field;
        let value;
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) {
            // Line with no colon - the entire line is the field name, value is empty
            field = line;
            value = '';
        }
        else {
            // Line with a colon - split into field name and value
            field = line.substring(0, colonIndex);
            value = line.substring(colonIndex + 1);
            // If value starts with a space, remove it
            if (value.startsWith(' ')) {
                value = value.substring(1);
            }
        }
        this.processField(field, value);
    }
    /**
     * Processes a field with the given name and value.
     */
    processField(field, value) {
        switch (field) {
            case 'event':
                this.eventTypeBuffer = value;
                break;
            case 'data':
                // Append the value to the data buffer, followed by a newline
                this.dataBuffer += value;
                this.dataBuffer += '\n';
                break;
            case 'id':
                // If the field value doesn't contain NULL, set the last event ID buffer
                if (!value.includes('\0')) {
                    this.currentEventId = this.lastEventIdBuffer = value;
                }
                else {
                    this.currentEventId = undefined;
                }
                break;
            case 'retry':
                // If the field value consists only of ASCII digits, set the reconnection time
                if (/^\d+$/.test(value)) {
                    this.reconnectionTime = parseInt(value, 10);
                }
                break;
            // Ignore any other fields
        }
    }
    /**
     * Dispatches the event based on the current buffer states.
     */
    dispatchEvent() {
        // If the data buffer is empty, reset the buffers and return
        if (this.dataBuffer === '') {
            this.dataBuffer = '';
            this.eventTypeBuffer = '';
            return;
        }
        // If the data buffer's last character is a newline, remove it
        if (this.dataBuffer.endsWith('\n')) {
            this.dataBuffer = this.dataBuffer.substring(0, this.dataBuffer.length - 1);
        }
        // Create and dispatch the event
        const event = {
            type: this.eventTypeBuffer || 'message',
            data: this.dataBuffer,
        };
        // Add optional fields if they exist
        if (this.currentEventId !== undefined) {
            event.id = this.currentEventId;
        }
        if (this.reconnectionTime !== undefined) {
            event.retry = this.reconnectionTime;
        }
        // Dispatch the event
        this.onEventHandler(event);
        // Reset the data and event type buffers
        this.reset();
    }
    /**
     * Resets the parser state.
     */
    reset() {
        this.dataBuffer = '';
        this.eventTypeBuffer = '';
        this.currentEventId = undefined;
        // Note: lastEventIdBuffer is not reset as it's used for reconnection
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NlUGFyc2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vc3NlUGFyc2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBcUNoRyxJQUFXLEdBS1Y7QUFMRCxXQUFXLEdBQUc7SUFDYiwwQkFBTyxDQUFBO0lBQ1AsMEJBQU8sQ0FBQTtJQUNQLGdDQUFVLENBQUE7SUFDVixnQ0FBVSxDQUFBO0FBQ1gsQ0FBQyxFQUxVLEdBQUcsS0FBSCxHQUFHLFFBS2I7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyxTQUFTO0lBVXJCOzs7T0FHRztJQUNILFlBQVksT0FBd0I7UUFiNUIsZUFBVSxHQUFHLEVBQUUsQ0FBQztRQUNoQixvQkFBZSxHQUFHLEVBQUUsQ0FBQztRQUlyQixXQUFNLEdBQWlCLEVBQUUsQ0FBQztRQUMxQixjQUFTLEdBQUcsS0FBSyxDQUFDO1FBUXpCLElBQUksQ0FBQyxjQUFjLEdBQUcsT0FBTyxDQUFDO1FBQzlCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVEOztPQUVHO0lBQ0ksY0FBYztRQUNwQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUMvQixDQUFDO0lBQ0Q7O09BRUc7SUFDSSxtQkFBbUI7UUFDekIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUM7SUFDOUIsQ0FBQztJQUVEOzs7T0FHRztJQUNJLElBQUksQ0FBQyxLQUFpQjtRQUM1QixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFFZixxR0FBcUc7UUFDckcsSUFBSSxJQUFJLENBQUMsU0FBUyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsb0JBQVcs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