export const log = (...args: any[]) => {
    console.error(`[${new Date().toISOString()}]`, ...args);
};
