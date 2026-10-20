import { build } from 'esbuild';
await build({entryPoints:['backend/worker.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist-backend/worker.cjs',sourcemap:true});
