export function extractContext(fileLines, startLine, endLine) {
    var codeLines = fileLines.filter(function (l) { return l.type !== 'hunk-header'; });
    var startIdx = codeLines.findIndex(function (l) { return l.diffLineNumber === startLine; });
    var endIdx = codeLines.findIndex(function (l) { return l.diffLineNumber === endLine; });
    if (startIdx === -1 || endIdx === -1)
        return [];
    var from = Math.max(0, startIdx - 3);
    var to = Math.min(codeLines.length - 1, endIdx + 3);
    return codeLines.slice(from, to + 1).map(function (l) { return ({
        diffLineNumber: l.diffLineNumber,
        type: l.type,
        content: l.content,
    }); });
}
