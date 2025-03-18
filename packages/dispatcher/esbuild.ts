import esbuild from 'esbuild';

export default async function build() {
    await esbuild.build({
        entryPoints: ['./src/index.ts', './src/workers/acknowledger/runner.ts', './src/workers/distributor/runner.ts', './src/workers/republisher/runner.ts'],
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
