const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  moduleNameMapper: {
    ...jestConfig.moduleNameMapper,
    "^c/pipelineStyles$": "<rootDir>/jest-mocks/pipelineStyles.js",
    "^@salesforce/resourceUrl/(.*)$": "<rootDir>/jest-mocks/resourceUrl.js"
  },
  modulePathIgnorePatterns: ["<rootDir>/.localdevserver"]
};
