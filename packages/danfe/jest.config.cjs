module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/\\.rollup\\.cache/'],
  moduleNameMapper: {
    // import.meta não compila no ts-jest em CommonJS; o build real é coberto por `pnpm test:dist`
    '^(\\.{1,2}/)+(utils/)?DiretorioDoModulo(\\.js)?$': '<rootDir>/test-support/DiretorioDoModulo.jest.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'CommonJS',
        moduleResolution: 'Node',
        esModuleInterop: true,
      },
    }],
  },
};
