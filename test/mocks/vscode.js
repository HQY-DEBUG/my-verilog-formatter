module.exports = {
    workspace: {
        getConfiguration: (scope) => {
            return {
                get: (key, defaultValue) => defaultValue,
            };
        },
    },
};
