/**
 * Last minute effort to make sure workers bubble up their errors.
 */
export const exitNotSwiftly = (error: unknown) => {
    console.error("Exiting not swiftly", error);
    process.exit(1);
}
