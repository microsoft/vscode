"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentMergeConflict = void 0;
class DocumentMergeConflict {
    telemetryReporter;
    range;
    current;
    incoming;
    commonAncestors;
    splitter;
    applied = false;
    constructor(descriptor, telemetryReporter) {
        this.telemetryReporter = telemetryReporter;
        this.range = descriptor.range;
        this.current = descriptor.current;
        this.incoming = descriptor.incoming;
        this.commonAncestors = descriptor.commonAncestors;
        this.splitter = descriptor.splitter;
    }
    commitEdit(type, editor, edit) {
        function commitTypeToString(type) {
            switch (type) {
                case 0 /* interfaces.CommitType.Current */:
                    return 'current';
                case 1 /* interfaces.CommitType.Incoming */:
                    return 'incoming';
                case 2 /* interfaces.CommitType.Both */:
                    return 'both';
            }
        }
        /* __GDPR__
            "mergeMarkers.accept" : {
                "owner": "hediet",
                "comment": "Used to understand how the inline merge editor experience is used.",
                "resolution": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Indicates how the merge conflict was resolved by the user" }
            }
        */
        this.telemetryReporter.sendTelemetryEvent('mergeMarkers.accept', { resolution: commitTypeToString(type) });
        if (edit) {
            this.applyEdit(type, editor.document, edit);
            return Promise.resolve(true);
        }
        return editor.edit((edit) => this.applyEdit(type, editor.document, edit));
    }
    applyEdit(type, document, edit) {
        if (this.applied) {
            return;
        }
        this.applied = true;
        // Each conflict is a set of ranges as follows, note placements or newlines
        // which may not in spans
        // [ Conflict Range             -- (Entire content below)
        //   [ Current Header ]\n       -- >>>>> Header
        //   [ Current Content ]        -- (content)
        //   [ Splitter ]\n             -- =====
        //   [ Incoming Content ]       -- (content)
        //   [ Incoming Header ]\n      -- <<<<< Incoming
        // ]
        if (type === 0 /* interfaces.CommitType.Current */) {
            // Replace [ Conflict Range ] with [ Current Content ]
            const content = document.getText(this.current.content);
            this.replaceRangeWithContent(content, edit);
        }
        else if (type === 1 /* interfaces.CommitType.Incoming */) {
            const content = document.getText(this.incoming.content);
            this.replaceRangeWithContent(content, edit);
        }
        else if (type === 2 /* interfaces.CommitType.Both */) {
            // Replace [ Conflict Range ] with [ Current Content ] + \n + [ Incoming Content ]
            const currentContent = document.getText(this.current.content);
            const incomingContent = document.getText(this.incoming.content);
            edit.replace(this.range, currentContent.concat(incomingContent));
        }
    }
    replaceRangeWithContent(content, edit) {
        if (this.isNewlineOnly(content)) {
            edit.replace(this.range, '');
            return;
        }
        // Replace [ Conflict Range ] with [ Current Content ]
        edit.replace(this.range, content);
    }
    isNewlineOnly(text) {
        return text === '\n' || text === '\r\n';
    }
}
exports.DocumentMergeConflict = DocumentMergeConflict;
//# sourceMappingURL=documentMergeConflict.js.map