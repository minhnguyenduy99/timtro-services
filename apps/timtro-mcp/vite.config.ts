import { defineConfig } from 'vite';

const awsSdkExternals = ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'];

export default defineConfig({
  ssr: {
    external: awsSdkExternals,
    noExternal: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node24',
    ssr: true,
    minify: true,
    rolldownOptions: {
      input: 'src/lambda-handler.ts',
      external: awsSdkExternals,
      output: {
        entryFileNames: 'lambda.mjs',
        codeSplitting: false
      }
    }
  }
});
