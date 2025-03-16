import esbuild from 'esbuild';

export default async function build() {
    await esbuild.build({
        entryPoints: ['./src/index.ts', './src/workers/acknowledger.ts', './src/workers/message-distributor.ts', './src/workers/message-redistributor.ts'],
        bundle: true,
        outdir: './dist',
        platform: 'node',
        minify: true,
        sourcemap: true,
        preserveSymlinks: true,
        tsconfig: './tsconfig.json',
        resolveExtensions: ['.ts', '.js']
    });
}

build()
