import type { ParsedLine } from './types';
export interface ContextLineOutput {
    diffLineNumber: number;
    type: 'added' | 'removed' | 'context';
    content: string;
}
export declare function extractContext(fileLines: ParsedLine[], startLine: number, endLine: number): ContextLineOutput[];
