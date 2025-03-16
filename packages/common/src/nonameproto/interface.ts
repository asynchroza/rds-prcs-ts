import { types } from "..";

export type ParsedCommand = {
    operation: string;
    payload: unknown;
}

export interface Proto {
    decode(command: string): types.Result<ParsedCommand>;
    encode(parsedCommand: ParsedCommand): string;
}
