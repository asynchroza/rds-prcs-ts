const COMMANDS = [
    ["PROCESS", 0],
    ["ACK", 1]
] as const satisfies [string, number][];

export type Commands = typeof COMMANDS[number][0]

export const COMMANDS_TO_BINARY = new Map<string, number>(COMMANDS)
export const BINARY_TO_COMMANDS = new Map<number, Commands>(COMMANDS.map(([key, value]) => [value, key]))
