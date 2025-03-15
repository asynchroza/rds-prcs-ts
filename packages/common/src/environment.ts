class EnvironmentVariableMissing extends Error {
    constructor(name: string) {
        super(`Environment variable missing: ${name}`);
    }
}

export const loadEnvironment = (name: string) => {
    const value = process.env[name];

    if (!value) throw new EnvironmentVariableMissing(name);

    return value;
}
