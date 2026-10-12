module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    // import.meta não compila no ts-jest em CommonJS; o pacote construído é coberto por `pnpm test:dist`
    '^(\\.{1,2}/)+MDFeSchemaDir(\\.js)?$': '<rootDir>/test-support/MDFeSchemaDir.jest.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: false, tsconfig: { module: 'CommonJS', moduleResolution: 'Node', esModuleInterop: true } }] }
};
