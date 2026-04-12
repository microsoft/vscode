/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const javascriptIndentationRules = {
    decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/,
    increaseIndentPattern: /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/,
    // e.g.  * ...| or */| or *-----*/|
    unIndentedLinePattern: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$|^(\t|[ ])*[ ]\*\/\s*$|^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
    indentNextLinePattern: /^((.*=>\s*)|((.*[^\w]+|\s*)(if|while|for)\s*\(.*\)\s*))$/,
};
export const rubyIndentationRules = {
    decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif)\b|(in|when)\s)/,
    increaseIndentPattern: /^\s*((begin|class|(private|protected)\s+def|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|in|while|case)|([^#]*\sdo\b)|([^#]*=\s*(case|if|unless)))\b([^#\{;]|(\"|'|\/).*\4)*(#.*)?$/,
};
export const phpIndentationRules = {
    increaseIndentPattern: /({(?!.*}).*|\(|\[|((else(\s)?)?if|else|for(each)?|while|switch|case).*:)\s*((\/[/*].*|)?$|\?>)/,
    decreaseIndentPattern: /^(.*\*\/)?\s*((\})|(\)+[;,])|(\]\)*[;,])|\b(else:)|\b((end(if|for(each)?|while|switch));))/,
};
export const goIndentationRules = {
    decreaseIndentPattern: /^\s*(\bcase\b.*:|\bdefault\b:|}[)}]*[),]?|\)[,]?)$/,
    increaseIndentPattern: /^.*(\bcase\b.*:|\bdefault\b:|(\b(func|if|else|switch|select|for|struct)\b.*)?{[^}"'`]*|\([^)"'`]*)$/,
};
export const htmlIndentationRules = {
    decreaseIndentPattern: /^\s*(<\/(?!html)[-_\.A-Za-z0-9]+\b[^>]*>|-->|\})/,
    increaseIndentPattern: /<(?!\?|(?:area|base|br|col|frame|hr|html|img|input|keygen|link|menuitem|meta|param|source|track|wbr)\b|[^>]*\/>)([-_\.A-Za-z0-9]+)(?=\s|>)\b[^>]*>(?!.*<\/\1>)|<!--(?!.*-->)|\{[^}"']*$/,
};
export const latexIndentationRules = {
    decreaseIndentPattern: /^\s*\\end{(?!document)/,
    increaseIndentPattern: /\\begin{(?!document)([^}]*)}(?!.*\\end{\1})/,
};
export const luaIndentationRules = {
    decreaseIndentPattern: /^\s*((\b(elseif|else|end|until)\b)|(\})|(\)))/,
    increaseIndentPattern: /^((?!(\-\-)).)*((\b(else|function|then|do|repeat)\b((?!\b(end|until)\b).)*)|(\{\s*))$/,
};
export const vbIndentationRules = {
    // Decrease indent when line starts with End <keyword>, Else, ElseIf, Case, Catch, Finally, Loop, Next, Wend, Until
    decreaseIndentPattern: /^\s*((End\s+(If|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Select|Try|While|For|Property|Get|Set|SyncLock|Using|AddHandler|RaiseEvent|RemoveHandler|Event|Operator))|Else|ElseIf|Case|Catch|Finally|Loop|Next|Wend|Until)\b/i,
    // Increase indent after lines with block-starting keywords (Sub, Function, Class, Module, If...Then, etc.)
    // Both alternatives are anchored to start of line with ^\s*
    increaseIndentPattern: /^\s*((If|ElseIf).*Then(?!.*End\s+If)\s*(('|REM).*)?|(Else|While|For|Do|Select\s+Case|Case|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Try|Catch|Finally|SyncLock|Using|Property|Get|Set|AddHandler|RaiseEvent|RemoveHandler|Event|Operator)\b(?!.*\bEnd\s+(If|Sub|Function|Class|Module|Enum|Structure|Interface|Namespace|With|Select|Try|While|For|Property|Get|Set|SyncLock|Using|AddHandler|RaiseEvent|RemoveHandler|Event|Operator)\b).*(('|REM).*)?)$/i,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZW50YXRpb25SdWxlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy9zdXBwb3J0cy9pbmRlbnRhdGlvblJ1bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHO0lBQ3pDLHFCQUFxQixFQUFFLHFDQUFxQztJQUM1RCxxQkFBcUIsRUFBRSxxRUFBcUU7SUFDNUYsbUNBQW1DO0lBQ25DLHFCQUFxQixFQUFFLDRGQUE0RjtJQUNuSCxxQkFBcUIsRUFBRSwwREFBMEQ7Q0FDakYsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHO0lBQ25DLHFCQUFxQixFQUFFLDBGQUEwRjtJQUNqSCxxQkFBcUIsRUFBRSxxTUFBcU07Q0FDNU4sQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHO0lBQ2xDLHFCQUFxQixFQUFFLGdHQUFnRztJQUN2SCxxQkFBcUIsRUFBRSw0RkFBNEY7Q0FDbkgsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHO0lBQ2pDLHFCQUFxQixFQUFFLG9EQUFvRDtJQUMzRSxxQkFBcUIsRUFBRSxxR0FBcUc7Q0FDNUgsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHO0lBQ25DLHFCQUFxQixFQUFFLGtEQUFrRDtJQUN6RSxxQkFBcUIsRUFBRSx5TEFBeUw7Q0FDaE4sQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHO0lBQ3BDLHFCQUFxQixFQUFFLHdCQUF3QjtJQUMvQyxxQkFBcUIsRUFBRSw2Q0FBNkM7Q0FDcEUsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHO0lBQ2xDLHFCQUFxQixFQUFFLCtDQUErQztJQUN0RSxxQkFBcUIsRUFBRSx1RkFBdUY7Q0FDOUcsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHO0lBQ2pDLG1IQUFtSDtJQUNuSCxxQkFBcUIsRUFBRSxxUEFBcVA7SUFDNVEsMkdBQTJHO0lBQzNHLDREQUE0RDtJQUM1RCxxQkFBcUIsRUFBRSxvZEFBb2Q7Q0FDM2UsQ0FBQyJ9