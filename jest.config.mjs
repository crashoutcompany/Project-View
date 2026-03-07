import nextJest from "next/jest.js"

const createJestConfig = nextJest({
  dir: "./",
})

const customJestConfig = {
  clearMocks: true,
  coverageProvider: "v8",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
}

export default createJestConfig(customJestConfig)
